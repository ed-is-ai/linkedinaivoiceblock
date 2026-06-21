import { render } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import type { StoredPost, UnflaggedPost } from '../../shared/types';
import {
  buildPostData,
  appendEvalRun,
  getEvalRuns,
  summarize,
  compareRuns,
} from '../../shared/eval/index';
import type {
  EvalRun,
  PostDetail,
  ScoredEntry,
  EvalRunComparison,
} from '../../shared/eval/index';
import { assembleRun } from './evalsRunEngine';
import { HeuristicDetector } from '../../skills/library/detect-aiwriting-heuristic/detect-aiwriting-heuristic.skill';
import { MODEL_PRICING, computeCostUsd } from '../../shared/llm/pricing';
import { labelPost, seedLabels, countLabeled } from './evalsLabeling';

// ---------------------------------------------------------------------------
// Cost estimate constants for D-05 confirm modal
// ---------------------------------------------------------------------------

/** Detector model — must match the model used by the SCORE_POST handler (src/background/index.ts) */
const DETECTOR_MODEL = 'claude-sonnet-4-6';

/**
 * Representative per-post token estimate for the cost modal (D-05).
 * A typical LinkedIn post is ~200 tokens input (post text + system prompt overhead)
 * and ~60 tokens output (JSON score response). These are conservative estimates;
 * the SCORE_POST relay returns NO token usage so we cannot measure actual cost.
 */
const EST_INPUT_TOKENS_PER_POST = 200;
const EST_OUTPUT_TOKENS_PER_POST = 60;

/** Pre-compute avg $/post from the pricing table (estimate only — relay returns no usage). */
function estimateAvgUsdPerPost(): number {
  const { costUsd } = computeCostUsd(DETECTOR_MODEL, {
    input_tokens: EST_INPUT_TOKENS_PER_POST,
    output_tokens: EST_OUTPUT_TOKENS_PER_POST,
  });
  return costUsd;
}

const AVG_USD_PER_POST = estimateAvgUsdPerPost();

// Max chars of post text kept for FP/FN error cards. Cards wrap (errText has no
// nowrap/ellipsis), so this just bounds how much is stored per detail.
const ERR_PREVIEW_LEN = 280;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RunStatus =
  | { phase: 'idle' }
  | { phase: 'confirm'; postCount: number; estimatedUsd: number }
  | { phase: 'running'; scored: number; total: number; runningUsd: number }
  | { phase: 'done'; run: EvalRun };

function App() {
  const [posts, setPosts] = useState<StoredPost[]>([]);
  const [unflagged, setUnflagged] = useState<UnflaggedPost[]>([]);
  const [runs, setRuns] = useState<EvalRun[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [engine, setEngine] = useState<'heuristic' | 'llm'>('heuristic');
  const [runStatus, setRunStatus] = useState<RunStatus>({ phase: 'idle' });

  // Ref used by the run loop to honour cancellation without stale closure issues
  const cancelRef = useRef(false);

  useEffect(() => {
    chrome.storage.local
      .get(['storedPosts', 'unflaggedPosts', 'evalRuns'])
      .then((result: Record<string, unknown>) => {
        setPosts((result['storedPosts'] ?? []) as StoredPost[]);
        setUnflagged((result['unflaggedPosts'] ?? []) as UnflaggedPost[]);
        setRuns((result['evalRuns'] ?? []) as EvalRun[]);
      })
      .catch(() => {
        setLoadError('Could not load data. Try reopening the Evals page.');
      });
  }, []);

  // Derive last run and its best-threshold row for the run controls footer.
  // getEvalRuns() returns newest-first, so the most recent run is runs[0].
  const lastRun = runs[0] ?? null;
  const lastRunBestRow = lastRun
    ? lastRun.thresholds.find(t => t.threshold === lastRun.bestF1Threshold)
    : null;

  // Labeled posts dataset (label === 'ai' | 'human')
  type LabeledPost = { urn: string; text: string; label: 'ai' | 'human'; authorId?: string; authorName?: string };
  const totalPosts = posts.length + unflagged.length;
  const labeledCount = countLabeled([
    ...posts.map(p => ({ label: p.label })),
    ...unflagged.map(p => ({ label: p.label })),
  ]);

  function buildLabeledDataset(): LabeledPost[] {
    const dataset: LabeledPost[] = [];
    for (const p of posts) {
      if (p.label === 'ai' || p.label === 'human') {
        dataset.push({
          urn: p.urn,
          text: p.text,
          label: p.label as 'ai' | 'human',
          authorId: p.authorId,
          authorName: p.authorName,
        });
      }
    }
    for (const p of unflagged) {
      if (p.label === 'ai' || p.label === 'human') {
        dataset.push({
          urn: p.urn,
          text: p.text,
          label: p.label as 'ai' | 'human',
        });
      }
    }
    return dataset;
  }

  // ---------------------------------------------------------------------------
  // Run initiation
  // ---------------------------------------------------------------------------

  function handleRunClick() {
    const labeled = buildLabeledDataset();
    if (labeled.length === 0) return;

    if (engine === 'llm') {
      // D-05: confirm modal before LLM run
      const estimatedUsd = labeled.length * AVG_USD_PER_POST;
      setRunStatus({ phase: 'confirm', postCount: labeled.length, estimatedUsd });
    } else {
      // Heuristic is free/fast — no confirm modal (Claude's Discretion per CONTEXT)
      void startRun('heuristic', labeled);
    }
  }

  function handleConfirmApprove() {
    const labeled = buildLabeledDataset();
    setRunStatus({ phase: 'running', scored: 0, total: labeled.length, runningUsd: 0 });
    void startRun('llm', labeled);
  }

  function handleConfirmCancel() {
    setRunStatus({ phase: 'idle' });
  }

  function handleRunCancel() {
    cancelRef.current = true;
  }

  // ---------------------------------------------------------------------------
  // Core run loop
  // ---------------------------------------------------------------------------

  async function startRun(
    eng: 'heuristic' | 'llm',
    labeledPosts: LabeledPost[],
  ): Promise<void> {
    cancelRef.current = false;

    const total = labeledPosts.length;
    const skipped = totalPosts - labeledCount; // posts without a valid label
    let errored = 0;

    const scored: ScoredEntry[] = [];
    const details: PostDetail[] = [];

    // Heuristic detector: DOM-free, no fetchComments (generic-comments won't fire — expected)
    const heuristicDetector = new HeuristicDetector();

    // Running LLM cost accumulator (estimate-only: relay returns no usage per D-07)
    let runningEstimateUsd = 0;

    setRunStatus({ phase: 'running', scored: 0, total, runningUsd: 0 });

    for (let i = 0; i < labeledPosts.length; i++) {
      // D-06: check cancel flag each iteration
      if (cancelRef.current) break;

      const post = labeledPosts[i]!;

      try {
        let score: number;
        let confidence: 'high' | 'medium' | 'low';
        let signalBreakdown: Record<string, number>;
        let reasoning: string | undefined;

        if (eng === 'heuristic') {
          // Heuristic path: buildPostData → HeuristicDetector.detect (DOM-free, in-page)
          const postData = buildPostData(post as unknown as Record<string, unknown>);
          const result = await heuristicDetector.detect(postData);
          score = result.score;
          confidence = result.confidence;
          signalBreakdown = result.signalBreakdown;
          reasoning = result.reasoning;
        } else {
          // LLM path: route through the SCORE_POST relay — NEVER fetch Anthropic from the page (D-07).
          // The relay response is { result } | { error }; it carries NO token usage.
          // Cost is tracked as an estimate (i × avgUsdPerPost), not read from the response.
          const resp = await chrome.runtime.sendMessage({
            type: 'SCORE_POST',
            postText: post.text,
          }) as { result?: { score: number; confidence: 'high' | 'medium' | 'low'; signalBreakdown: Record<string, number>; reasoning?: string }; error?: string };

          if (resp.error) {
            errored++;
            // Update progress (errored post still counted in i+1)
            setRunStatus({ phase: 'running', scored: scored.length, total, runningUsd: runningEstimateUsd });
            continue;
          }

          const r = resp.result!;
          score = r.score;
          confidence = r.confidence;
          signalBreakdown = r.signalBreakdown;
          reasoning = r.reasoning;

          // Accumulate per-post estimate (relay returns no usage — cost is estimate-only)
          runningEstimateUsd += AVG_USD_PER_POST;
        }

        scored.push({ label: post.label, score });
        details.push({
          index: i + 1,
          label: post.label,
          score,
          confidence,
          signalBreakdown,
          ...(reasoning !== undefined ? { reasoning } : {}),
          textPreview: post.text.slice(0, ERR_PREVIEW_LEN),
        });

        // Update live progress (D-06)
        setRunStatus({
          phase: 'running',
          scored: scored.length,
          total,
          runningUsd: runningEstimateUsd,
        });
      } catch {
        errored++;
        setRunStatus({ phase: 'running', scored: scored.length, total, runningUsd: runningEstimateUsd });
      }
    }

    // ---------------------------------------------------------------------------
    // Post-loop: assemble + persist EvalRun (D-06: even if cancelled/interrupted)
    // ---------------------------------------------------------------------------

    const wasCancelled = cancelRef.current;
    const runAt = new Date().toISOString();

    // Cost semantics: relay returns no usage; cost is the pre-run estimate.
    // LLM cost = total labeled posts × avgUsdPerPost (the pre-run estimate figure).
    // This is consistent with the confirm modal estimate so users see a coherent number.
    const estimatedCost = eng === 'llm'
      ? { totalUsd: total * AVG_USD_PER_POST, avgUsdPerPost: AVG_USD_PER_POST }
      : null;

    const run = assembleRun({
      engine: eng,
      model: eng === 'heuristic' ? 'heuristic' : DETECTOR_MODEL,
      scored,
      details,
      counts: { total: totalPosts, labeled: total, skipped, errored },
      estimatedCost,
      runAt,
      // D-06: flag incomplete when cancelled OR when fewer posts scored than labeled
      incomplete: wasCancelled || scored.length < total,
    });

    // D-03: persist via appendEvalRun (even partial runs — D-06)
    await appendEvalRun(run);

    // Reload runs from storage to get the freshest list (appendEvalRun is FIFO-capped)
    const freshRuns = await getEvalRuns();
    setRuns(freshRuns);
    setRunStatus({ phase: 'done', run });
  }

  // ---------------------------------------------------------------------------
  // Current run for results rendering
  // ---------------------------------------------------------------------------

  // Prefer the just-finished run from runStatus; fall back to last persisted run
  const currentRun: EvalRun | null =
    runStatus.phase === 'done' ? runStatus.run : (runs[0] ?? null);

  const currentBestRow = currentRun
    ? currentRun.thresholds.find(t => t.threshold === currentRun.bestF1Threshold) ?? null
    : null;

  const isPartial = currentRun
    ? (currentRun.incomplete === true || currentRun.counts.scored < currentRun.counts.labeled)
    : false;

  // Compare to most recent earlier run of the SAME engine (Task 3)
  const compareBaseline: EvalRun | null = (() => {
    if (!currentRun) return null;
    // runs is newest-first; skip the current run (same id), find first matching engine
    return runs.find(r => r.id !== currentRun.id && r.engine === currentRun.engine) ?? null;
  })();

  const comparison: EvalRunComparison | null =
    currentRun && compareBaseline ? compareRuns(currentRun, compareBaseline) : null;

  // ---------------------------------------------------------------------------
  // Result summary line (uses summarize from the shared eval core)
  // ---------------------------------------------------------------------------

  const currentSummary = currentRun ? summarize(currentRun) : null;

  return (
    <div style={s.page}>
      <h1 style={s.heading}>LinkedIn Blocker — Evals</h1>
      <div style={s.crumb}>One scrollable console — labeling, eval runs, results, error analysis.</div>

      {loadError && <div style={s.errorMsg}>{loadError}</div>}

      {/* ------------------------------------------------------------------ */}
      {/* RUN CONTROLS                                                         */}
      {/* ------------------------------------------------------------------ */}
      <div style={s.card}>
        <div style={s.cardHeading}>Run an eval</div>
        <div style={s.label}>Dataset</div>
        <div style={{ marginBottom: 14, fontSize: 13, color: '#374151' }}>
          chrome.storage.local ({labeledCount} labeled / {totalPosts - labeledCount} unlabeled)
        </div>
        <div style={s.label}>Engine</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
          <button
            style={engine === 'heuristic' ? s.toggleActive : s.toggle}
            onClick={() => setEngine('heuristic')}
            disabled={runStatus.phase === 'running' || runStatus.phase === 'confirm'}
          >
            Heuristic (free)
          </button>
          <button
            style={engine === 'llm' ? s.toggleActive : s.toggle}
            onClick={() => setEngine('llm')}
            disabled={runStatus.phase === 'running' || runStatus.phase === 'confirm'}
          >
            LLM (Claude · ~${(labeledCount * AVG_USD_PER_POST).toFixed(3)})
          </button>
        </div>

        {/* ---- Confirm modal (LLM D-05) ---- */}
        {runStatus.phase === 'confirm' && (
          <div style={s.confirmBox}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
              Confirm LLM eval
            </div>
            <div style={{ fontSize: 12, color: '#374151', marginBottom: 12 }}>
              ~{runStatus.postCount} posts · est. ${runStatus.estimatedUsd.toFixed(3)} · This will send each post to Claude via the extension relay (no API key stored in the page).
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={s.primaryBtn} onClick={handleConfirmApprove}>
                Run
              </button>
              <button style={s.actionBtn} onClick={handleConfirmCancel}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* ---- Running progress (D-06) ---- */}
        {runStatus.phase === 'running' && (
          <div style={s.progressBox}>
            <div style={{ fontSize: 12, color: '#374151', marginBottom: 8 }}>
              {runStatus.scored}/{runStatus.total} scored
              {engine === 'llm' && runStatus.runningUsd > 0
                ? ` · ~$${runStatus.runningUsd.toFixed(4)} so far (estimate)`
                : ''}
            </div>
            <div style={s.progressBar}>
              <div
                style={{
                  ...s.progressFill,
                  width: `${runStatus.total > 0 ? (runStatus.scored / runStatus.total) * 100 : 0}%`,
                }}
              />
            </div>
            <button style={{ ...s.actionBtn, marginTop: 8 }} onClick={handleRunCancel}>
              Cancel
            </button>
          </div>
        )}

        {/* ---- Run button (idle / done) ---- */}
        {(runStatus.phase === 'idle' || runStatus.phase === 'done') && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              style={labeledCount === 0 ? s.primaryBtnDisabled : s.primaryBtn}
              disabled={labeledCount === 0}
              onClick={handleRunClick}
            >
              {labeledCount === 0 ? 'No labeled posts' : '▶ Run eval'}
            </button>
            {lastRun ? (
              <span style={s.sub}>
                Last run: {lastRun.runAt.slice(0, 10)} · {lastRun.engine} · F1{' '}
                {lastRunBestRow?.f1 != null ? lastRunBestRow.f1.toFixed(2) : '—'}
              </span>
            ) : (
              <span style={s.sub}>No eval runs yet</span>
            )}
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* METRICS GRID                                                         */}
      {/* ------------------------------------------------------------------ */}
      <div style={s.card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <div style={s.cardHeading}>
            Results{currentRun ? ` — ${currentRun.engine} · best-F1 threshold ${currentRun.bestF1Threshold}` : ''}
          </div>
          {isPartial && (
            <span style={s.partialBadge}>partial</span>
          )}
        </div>
        {currentRun && currentBestRow ? (
          <>
            <div style={s.metricsGrid}>
              <div style={s.metric}>
                <div style={s.metricValue}>{currentBestRow.f1 != null ? currentBestRow.f1.toFixed(2) : '—'}</div>
                <div style={s.metricKey}>F1</div>
              </div>
              <div style={s.metric}>
                <div style={s.metricValue}>{currentBestRow.precision != null ? currentBestRow.precision.toFixed(2) : '—'}</div>
                <div style={s.metricKey}>Precision</div>
              </div>
              <div style={s.metric}>
                <div style={s.metricValue}>{currentBestRow.recall != null ? currentBestRow.recall.toFixed(2) : '—'}</div>
                <div style={s.metricKey}>Recall</div>
              </div>
              <div style={s.metric}>
                <div style={s.metricValue}>{currentBestRow.accuracy.toFixed(2)}</div>
                <div style={s.metricKey}>Accuracy</div>
              </div>
            </div>
            <div style={{ ...s.sub, marginTop: 8 }}>
              {currentSummary
                ? `${currentRun.counts.scored} posts scored · ${currentSummary.fpCount} FP · ${currentSummary.fnCount} FN`
                  + (currentSummary.costUsd != null ? ` · est. $${currentSummary.costUsd.toFixed(4)}` : ' · free (heuristic)')
                : ''}
              {isPartial ? ' · metrics on partial data' : ''}
            </div>
          </>
        ) : (
          <div style={s.sub}>No results yet — run an eval above.</div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* THRESHOLD SWEEP                                                      */}
      {/* ------------------------------------------------------------------ */}
      <div style={s.card}>
        <div style={s.cardHeading}>Threshold sweep</div>
        {currentRun && currentRun.thresholds.length > 0 ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 8 }}>
            <thead>
              <tr>
                {(['Threshold', 'Precision', 'Recall', 'F1', 'Accuracy', 'FP', 'FN'] as const).map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #f3f4f6', color: '#6b7280', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {currentRun.thresholds.map(row => {
                const isBest = row.threshold === currentRun.bestF1Threshold;
                return (
                  <tr
                    key={row.threshold}
                    style={isBest ? { background: '#eff6ff', fontWeight: 600 } : {}}
                  >
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid #f3f4f6' }}>
                      {row.threshold}{isBest ? ' ◀ best' : ''}
                    </td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid #f3f4f6' }}>{row.precision != null ? row.precision.toFixed(2) : '—'}</td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid #f3f4f6' }}>{row.recall != null ? row.recall.toFixed(2) : '—'}</td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid #f3f4f6' }}>{row.f1 != null ? row.f1.toFixed(2) : '—'}</td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid #f3f4f6' }}>{row.accuracy.toFixed(2)}</td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid #f3f4f6' }}>{row.fp}</td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid #f3f4f6' }}>{row.fn}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div style={s.sub}>Run an eval to see the threshold sweep table.</div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* ERROR ANALYSIS — FP/FN cards with signal pills                       */}
      {/* ------------------------------------------------------------------ */}
      <div style={s.card}>
        <div style={s.cardHeading}>Error analysis</div>
        {currentRun && (currentRun.errorAnalysis.falsePositives.length > 0 || currentRun.errorAnalysis.falseNegatives.length > 0) ? (
          <>
            <div style={{ ...s.sub, marginBottom: 12 }}>
              {currentRun.errorAnalysis.falsePositives.length} FP / {currentRun.errorAnalysis.falseNegatives.length} FN @ threshold {currentRun.errorAnalysis.threshold}
              {isPartial && <span style={s.partialBadge}>partial</span>}
            </div>

            {currentRun.errorAnalysis.falsePositives.length > 0 && (
              <>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#991b1b', marginBottom: 8 }}>
                  False Positives — true Human, predicted AI ({currentRun.errorAnalysis.falsePositives.length})
                </div>
                {currentRun.errorAnalysis.falsePositives.map((post, idx) => (
                  <ErrorCard key={idx} post={post} type="fp" />
                ))}
              </>
            )}

            {currentRun.errorAnalysis.falseNegatives.length > 0 && (
              <>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#92400e', marginTop: 12, marginBottom: 8 }}>
                  False Negatives — true AI, predicted Human ({currentRun.errorAnalysis.falseNegatives.length})
                </div>
                {currentRun.errorAnalysis.falseNegatives.map((post, idx) => (
                  <ErrorCard key={idx} post={post} type="fn" />
                ))}
              </>
            )}
          </>
        ) : currentRun ? (
          <div style={s.sub}>No FP or FN at threshold {currentRun.errorAnalysis.threshold}.</div>
        ) : (
          <div style={s.sub}>Run an eval to see false positives and false negatives.</div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* COMPARE TO PREVIOUS — Δ table via compareRuns                        */}
      {/* ------------------------------------------------------------------ */}
      {comparison && (
        <div style={s.card}>
          <div style={s.cardHeading}>
            Compare to previous {comparison.baseline.engine} run ({comparison.baseline.datasetLabel})
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 8 }}>
            <thead>
              <tr>
                {(['Metric', 'Current', 'Baseline', 'Δ'] as const).map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #f3f4f6', color: '#6b7280', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { name: 'F1',        d: comparison.f1 },
                { name: 'Precision', d: comparison.precision },
                { name: 'Recall',    d: comparison.recall },
                { name: 'Cost (est. USD)',   d: comparison.cost },
              ].map(({ name, d }) => (
                <tr key={name}>
                  <td style={{ padding: '6px 8px', borderBottom: '1px solid #f3f4f6', fontWeight: 600 }}>{name}</td>
                  <td style={{ padding: '6px 8px', borderBottom: '1px solid #f3f4f6' }}>
                    {d.current != null ? d.current.toFixed(4) : '—'}
                  </td>
                  <td style={{ padding: '6px 8px', borderBottom: '1px solid #f3f4f6' }}>
                    {d.baseline != null ? d.baseline.toFixed(4) : '—'}
                  </td>
                  <td style={{ padding: '6px 8px', borderBottom: '1px solid #f3f4f6', color: deltaColor(d.delta, name) }}>
                    {d.delta != null ? (d.delta >= 0 ? '+' : '') + d.delta.toFixed(4) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* LABELING SECTION                                                     */}
      {/* ------------------------------------------------------------------ */}
      <LabelingSection
        posts={posts}
        unflagged={unflagged}
        setPosts={setPosts}
        setUnflagged={setUnflagged}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// deltaColor — colour Δ column cells (green = improvement, red = regression)
// ---------------------------------------------------------------------------

function deltaColor(delta: number | null, metricName: string): string {
  if (delta === null) return '#374151';
  // For cost: lower is better (negative delta = improvement)
  const lowerIsBetter = metricName.toLowerCase().includes('cost');
  if (lowerIsBetter) {
    return delta < 0 ? '#059669' : delta > 0 ? '#dc2626' : '#374151';
  }
  return delta > 0 ? '#059669' : delta < 0 ? '#dc2626' : '#374151';
}

// ---------------------------------------------------------------------------
// ErrorCard — FP/FN post card with signal pills
// Renders previews/signal names as children, never dangerouslySetInnerHTML (T-28-11)
// ---------------------------------------------------------------------------

interface ErrorCardProps {
  post: PostDetail;
  type: 'fp' | 'fn';
}

function ErrorCard({ post, type }: ErrorCardProps) {
  const borderColor = type === 'fp' ? '#dc2626' : '#f59e0b';
  const tagStyle = type === 'fp' ? s.tagFp : s.tagFn;
  const tagLabel = type === 'fp' ? 'FP' : 'FN';

  // Sort signal pills by score descending (mirrors formatSignalBreakdown ordering)
  const signals = Object.entries(post.signalBreakdown)
    .sort(([, a], [, b]) => b - a);

  return (
    <div style={{ ...s.errCard, borderLeftColor: borderColor }}>
      <div style={s.errTop}>
        <span style={tagStyle}>{tagLabel}</span>
        <span>score {post.score} · label: {post.label}</span>
      </div>
      <div style={s.errText}>{post.textPreview}{post.textPreview.length >= ERR_PREVIEW_LEN ? '…' : ''}</div>
      {signals.length > 0 && (
        <div style={{ marginTop: 6 }}>
          {signals.map(([sig, val]) => (
            <span key={sig} style={val >= 15 ? s.pillHot : s.pill}>
              {sig} {val}
            </span>
          ))}
        </div>
      )}
      {post.reasoning && (
        <div style={s.errReason}>{post.reasoning}</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Labeling section — extracted so the App component is focused on layout
// ---------------------------------------------------------------------------

interface LabelingSectionProps {
  readonly posts: StoredPost[];
  readonly unflagged: UnflaggedPost[];
  readonly setPosts: (v: StoredPost[]) => void;
  readonly setUnflagged: (v: UnflaggedPost[]) => void;
}

function LabelingSection({ posts, unflagged, setPosts, setUnflagged }: LabelingSectionProps) {
  type PostRow = { urn: string; text: string; label?: string };

  const allPosts: PostRow[] = [
    ...posts.map(p => ({ urn: p.urn, text: p.text, label: p.label })),
    ...unflagged.map(p => ({ urn: p.urn, text: p.text, label: p.label })),
  ];

  const labeled = countLabeled(allPosts);
  const total = allPosts.length;

  async function handleLabelClick(urn: string, label: 'ai' | 'human'): Promise<void> {
    await labelPost(urn, label);
    setPosts(posts.map(p => p.urn === urn ? { ...p, label } : p));
    setUnflagged(unflagged.map(p => p.urn === urn ? { ...p, label } : p));
  }

  async function handleBulkSeed(): Promise<void> {
    await seedLabels();
    const result = await chrome.storage.local.get(['storedPosts', 'unflaggedPosts']);
    setPosts((result['storedPosts'] ?? []) as StoredPost[]);
    setUnflagged((result['unflaggedPosts'] ?? []) as UnflaggedPost[]);
  }

  return (
    <div style={s.card}>
      <div style={s.cardHeading}>
        Label posts ({labeled} labeled of {total} posts)
      </div>
      {allPosts.length === 0 ? (
        <div style={s.sub}>
          No posts yet — browse LinkedIn to collect posts, then label them here.
        </div>
      ) : (
        allPosts.map(post => (
          <div key={post.urn} style={s.lblRow}>
            <span style={s.lblText}>{post.text}</span>
            <span style={s.seg}>
              <button
                style={post.label === 'ai' ? s.segBtnAiSelected : s.segBtnAi}
                onClick={() => handleLabelClick(post.urn, 'ai')}
              >
                AI
              </button>
              <button
                style={post.label === 'human' ? s.segBtnHumanSelected : s.segBtnHuman}
                onClick={() => handleLabelClick(post.urn, 'human')}
              >
                Human
              </button>
            </span>
          </div>
        ))
      )}
      <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '16px 0' }} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button style={s.actionBtn} onClick={handleBulkSeed}>
          Bulk: flagged→AI, unflagged→Human
        </button>
        <span style={s.sub}>Writes label back to storage (skips already-labeled posts)</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Re-export helpers for callers that import from evals.tsx directly.
// The implementations live in evalsLabeling.ts (static imports, fully mockable).
// ---------------------------------------------------------------------------

export { labelPost, seedLabels, countLabeled } from './evalsLabeling';

// ---------------------------------------------------------------------------
// Inline styles — no CSS class names (CLAUDE.md constraint)
// ---------------------------------------------------------------------------

const s: Record<string, import('preact').JSX.CSSProperties> = {
  page: {
    maxWidth: 760,
    margin: '40px auto',
    padding: '0 24px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    color: '#1a1a1a',
  },
  heading: { fontSize: 22, fontWeight: 700, margin: '0 0 6px' },
  crumb: { fontSize: 13, color: '#6b7280', marginBottom: 24 },
  card: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    padding: '20px 24px',
    marginBottom: 16,
  },
  cardHeading: { fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 0 },
  label: { fontSize: 13, color: '#6b7280', marginBottom: 6 },
  sub: { fontSize: 12, color: '#9ca3af', marginTop: 4 },
  toggle: {
    padding: '6px 16px',
    border: '1px solid #d1d5db',
    borderRadius: 20,
    background: '#fff',
    cursor: 'pointer',
    fontSize: 13,
  },
  toggleActive: {
    padding: '6px 16px',
    border: '1px solid #0a66c2',
    borderRadius: 20,
    background: '#0a66c2',
    color: '#fff',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
  },
  primaryBtn: {
    padding: '6px 16px',
    border: '1px solid #0a66c2',
    borderRadius: 6,
    background: '#0a66c2',
    color: '#fff',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
  },
  primaryBtnDisabled: {
    padding: '6px 16px',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    background: '#d1d5db',
    color: '#fff',
    cursor: 'not-allowed',
    fontSize: 13,
    fontWeight: 600,
  },
  actionBtn: {
    padding: '6px 16px',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    background: '#fff',
    cursor: 'pointer',
    fontSize: 13,
  },
  errorMsg: { fontSize: 12, color: '#dc2626', marginBottom: 8 },
  confirmBox: {
    background: '#fffbeb',
    border: '1px solid #fde68a',
    borderRadius: 8,
    padding: '14px 16px',
    marginBottom: 8,
  },
  progressBox: {
    background: '#f3f4f6',
    borderRadius: 8,
    padding: '12px 14px',
    marginBottom: 8,
  },
  progressBar: {
    background: '#e5e7eb',
    borderRadius: 4,
    height: 6,
    overflow: 'hidden',
  },
  progressFill: {
    background: '#0a66c2',
    height: '100%',
    borderRadius: 4,
    transition: 'width 0.2s ease',
  },
  partialBadge: {
    display: 'inline-block',
    fontSize: 10,
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: 4,
    background: '#fef3c7',
    color: '#92400e',
    marginLeft: 6,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.03em',
  },
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 12,
  },
  metric: {
    background: '#f3f4f6',
    borderRadius: 8,
    padding: 14,
  },
  metricValue: { fontSize: 28, fontWeight: 700, color: '#0a66c2', lineHeight: 1.1 },
  metricKey: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 4,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.03em',
  },
  errCard: {
    borderLeft: '3px solid #dc2626',
    padding: '10px 12px',
    marginBottom: 8,
    background: '#fff',
    borderRadius: '0 6px 6px 0',
    border: '1px solid #e5e7eb',
    borderLeftWidth: 3,
  },
  errTop: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
  },
  errText: { fontSize: 13, color: '#1a1a1a', margin: '6px 0', whiteSpace: 'pre-wrap' as const, overflowWrap: 'break-word' as const },
  errReason: { fontSize: 12, color: '#6b7280', fontStyle: 'italic' as const, marginTop: 4 },
  tagFp: {
    fontSize: 10,
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: 4,
    background: '#fee2e2',
    color: '#991b1b',
  },
  tagFn: {
    fontSize: 10,
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: 4,
    background: '#fef3c7',
    color: '#92400e',
  },
  pill: {
    display: 'inline-block',
    fontSize: 10,
    padding: '2px 7px',
    borderRadius: 10,
    margin: '0 4px 4px 0',
    background: '#f3f4f6',
    color: '#374151',
  },
  pillHot: {
    display: 'inline-block',
    fontSize: 10,
    padding: '2px 7px',
    borderRadius: 10,
    margin: '0 4px 4px 0',
    background: '#fee2e2',
    color: '#991b1b',
  },
  lblRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 0',
    borderBottom: '1px solid #f3f4f6',
  },
  lblText: {
    flex: 1,
    fontSize: 12,
    color: '#374151',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  seg: {
    display: 'inline-flex',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    overflow: 'hidden',
  },
  segBtnAi: {
    border: 'none',
    background: '#fff',
    padding: '4px 10px',
    fontSize: 11,
    cursor: 'pointer',
    color: '#dc2626',
  },
  segBtnAiSelected: {
    border: 'none',
    background: '#dc2626',
    color: '#fff',
    padding: '4px 10px',
    fontSize: 11,
    cursor: 'pointer',
  },
  segBtnHuman: {
    border: 'none',
    background: '#fff',
    padding: '4px 10px',
    fontSize: 11,
    cursor: 'pointer',
    color: '#059669',
  },
  segBtnHumanSelected: {
    border: 'none',
    background: '#059669',
    color: '#fff',
    padding: '4px 10px',
    fontSize: 11,
    cursor: 'pointer',
  },
};

render(<App />, document.getElementById('root')!);
