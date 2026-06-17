#!/usr/bin/env node
// Reads a labeled Export JSON (produced by the dashboard's Export JSON button),
// re-scores each labeled post through either the HeuristicDetector (--engine heuristic,
// free) or the shared LLM classifier (--engine llm, default — Phase 26 behavior preserved),
// computes precision/recall/F1/accuracy across a threshold sweep (35–90 step 5),
// prints a full metrics table + FP/FN error analysis + compact summary, persists results
// to eval/results-YYYY-MM-DD.json as a conformant EvalRun record, and exits non-zero
// on bad input.
// Run via: npm run eval -- <labeled-posts.json> [--engine heuristic|llm]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeCostUsd } from '../src/shared/pricing.js';
import { classifyPost } from '../src/skills/library/detect-aiwriting-llm/classifier.js';
import {
  THRESHOLDS,
  safe,
  computeMetrics,
  formatSignalBreakdown,
  buildPostData,
  filterErrors,
  type PostDetail,
  type ScoredEntry,
  type ThresholdRow,
  type EvalRun,
} from '../src/shared/eval/index.js';
// Direct import from src/content/detector/heuristic.ts — safe because HeuristicDetector
// is already completely DOM-free (no document.*, no chrome.*, no selector literals).
// The Phase 28 dashboard reuses this SAME import (it is DOM-free; no re-homing needed).
import { HeuristicDetector } from '../src/skills/library/detect-aiwriting-heuristic/detect-aiwriting-heuristic.skill.js';
import type { PostData } from '../src/shared/types.js';
import { detectionConfig } from '../src/skills/library/detect-aiwriting-heuristic/detectionConfig.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODEL = 'claude-sonnet-4-6';
const EVAL_DIR = join(__dirname, '../eval');
// THRESHOLDS imported from ../src/shared/eval/index.js (D-03 — single shared constant, no drift)

// ---------------------------------------------------------------------------
// Walker (pure, exportable for tests — EVAL-01)
// ---------------------------------------------------------------------------

export interface PostEntry {
  urn?: string;
  authorId?: string;
  authorName?: string;
  text: string;
  label: 'ai' | 'human';
}

export interface WalkResult {
  labeled: PostEntry[];
  skipped: number;
}

/** Walk flaggedPosts + unflaggedPosts only (D-07 / Phase 25.2 amendment). */
export function collectLabeled(
  flaggedPosts: unknown[],
  unflaggedPosts: unknown[],
): WalkResult {
  const labeled: PostEntry[] = [];
  let skipped = 0;

  for (const rawEntry of [...flaggedPosts, ...unflaggedPosts]) {
    if (rawEntry === null || typeof rawEntry !== 'object') {
      process.stderr.write(`Warning: skipping non-object entry: ${JSON.stringify(rawEntry)}\n`);
      continue;
    }

    const entry = rawEntry as Record<string, unknown>;
    const text = typeof entry['text'] === 'string' ? entry['text'] : '';
    const label = entry['label'];

    if (label === undefined || label === null) {
      skipped++;
      continue;
    }

    if (label !== 'ai' && label !== 'human') {
      process.stderr.write(`Warning: skipping entry with invalid label "${String(label)}" — expected "ai" or "human".\n`);
      skipped++;
      continue;
    }

    labeled.push({
      urn: typeof entry['urn'] === 'string' ? entry['urn'] : undefined,
      authorId: typeof entry['authorId'] === 'string' ? entry['authorId'] : undefined,
      authorName: typeof entry['authorName'] === 'string' ? entry['authorName'] : undefined,
      text,
      label,
    });
  }

  return { labeled, skipped };
}

// ---------------------------------------------------------------------------
// Export loader (exportable for tests — EVAL-05 bad-input contract)
// ---------------------------------------------------------------------------

export interface LabeledExport {
  flaggedPosts: unknown[];
  unflaggedPosts: unknown[];
}

/**
 * Read + parse the labeled Export JSON and validate its top-level shape.
 * Writes a clear stderr message and exits non-zero on any failure.
 */
export function loadExport(filePath: string): LabeledExport {
  let json: unknown;
  try {
    const raw = readFileSync(resolve(filePath), 'utf8');
    json = JSON.parse(raw);
  } catch {
    process.stderr.write(`Error: Could not read or parse file: ${filePath}\n`);
    process.exit(1);
  }

  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    process.stderr.write(`Error: Could not read or parse file: ${filePath}\n`);
    process.exit(1);
  }

  const obj = json as Record<string, unknown>;
  if (!Array.isArray(obj['flaggedPosts']) || !Array.isArray(obj['unflaggedPosts'])) {
    process.stderr.write('Error: JSON must contain "flaggedPosts" and "unflaggedPosts" arrays.\n');
    process.exit(1);
  }

  return { flaggedPosts: obj['flaggedPosts'], unflaggedPosts: obj['unflaggedPosts'] };
}

// ---------------------------------------------------------------------------
// CLI entry guard — only runs when invoked directly (not when imported by tests)
// ---------------------------------------------------------------------------

const isMain = process.argv[1] !== undefined &&
  (process.argv[1].endsWith('eval.ts') || process.argv[1].endsWith('eval.js'));

if (isMain) {
  await main();
}

export async function main(): Promise<void> {
  // 1. Arg parsing — extract --engine flag and file path
  const args = process.argv.slice(2);
  const engineFlagIdx = args.indexOf('--engine');
  const engine: 'heuristic' | 'llm' =
    engineFlagIdx !== -1 && args[engineFlagIdx + 1] === 'heuristic'
      ? 'heuristic'
      : 'llm';  // default: llm — preserves Phase 26 backward-compatibility (D-02)
  const engineValueIdx = engineFlagIdx !== -1 ? engineFlagIdx + 1 : -1;
  const filePath = args.find((a, i) => !a.startsWith('--') && i !== engineValueIdx);

  if (!filePath) {
    process.stderr.write('Usage: npm run eval -- <labeled-posts.json> [--engine heuristic|llm]\n');
    process.exit(1);
  }

  // 2. File read + JSON parse + shape/array validation (CR-01 guarded in loadExport)
  const parsed = loadExport(filePath);

  // 3. API key guard — only required for LLM engine (heuristic is free — pitfall 3)
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (engine === 'llm' && !apiKey) {
    process.stderr.write('Error: ANTHROPIC_API_KEY environment variable is not set.\n');
    process.exit(1);
  }

  // 4. Walk flaggedPosts + unflaggedPosts only (D-07 / Phase 25.2)
  const { labeled: labeledPosts, skipped } = collectLabeled(parsed.flaggedPosts, parsed.unflaggedPosts);

  // 5. No-label guard
  if (labeledPosts.length === 0) {
    process.stderr.write(
      `Error: No labeled posts found (${skipped} unlabeled entries skipped). ` +
      `Add "label": "ai" or "label": "human" to each post.\n`,
    );
    process.exit(1);
  }

  const total = parsed.flaggedPosts.length + parsed.unflaggedPosts.length;
  const labeled = labeledPosts.length;
  process.stdout.write(`\nEval [${engine}]: ${labeled} labeled posts (${skipped} unlabeled skipped, ${total} total).\n\n`);

  // 6. Instantiate heuristic detector (before loop — no fetchComments: eval has no DOM;
  //    generic-comments will never fire — documented in eval-instructions.md pitfall 5)
  const heuristicDetector = new HeuristicDetector();  // no fetchComments — eval has no DOM

  // 7. Sequential scoring loop
  const scored: ScoredEntry[] = [];
  const details: PostDetail[] = [];
  let totalCostUsd = 0;
  let errored = 0;

  for (let i = 0; i < labeledPosts.length; i++) {
    const post = labeledPosts[i]!;
    try {
      // result type is DetectionResult — inferred from both branches below
      let result: Awaited<ReturnType<typeof heuristicDetector.detect>>;

      if (engine === 'heuristic') {
        // Build PostData from export entry (maps text → postText, stubs authorProfileUrl)
        const postData: PostData = buildPostData(post as unknown as Record<string, unknown>);
        result = await heuristicDetector.detect(postData);
        // No usage — heuristic is free; totalCostUsd stays at 0
      } else {
        // LLM path — keeps Phase 26 behavior via classifyPost (D-01)
        const classified = await classifyPost(post.text, apiKey!);
        result = classified.result;
        const usage = classified.usage;
        if (usage) {
          const { costUsd } = computeCostUsd(MODEL, {
            input_tokens: safe(usage.input_tokens),
            output_tokens: safe(usage.output_tokens),
            cache_creation_input_tokens: safe(usage.cache_creation_input_tokens ?? 0),
            cache_read_input_tokens: safe(usage.cache_read_input_tokens ?? 0),
          });
          totalCostUsd += safe(costUsd);
        }
      }

      scored.push({ label: post.label, score: result.score });
      details.push({
        index: i + 1,
        label: post.label,
        score: result.score,
        confidence: result.confidence,
        signalBreakdown: result.signalBreakdown,
        ...(result.reasoning ? { reasoning: result.reasoning } : {}),
        textPreview: post.text.slice(0, 80),
      });

      // Progress header
      const costPart = engine === 'heuristic'
        ? ''
        : ` | running cost $${totalCostUsd.toFixed(6)}`;
      process.stdout.write(
        `  [${i + 1}/${labeled}] score=${result.score} label=${post.label} confidence=${result.confidence}` +
        `${costPart}\n`,
      );
      // Per-signal breakdown + optional reasoning
      process.stdout.write(formatSignalBreakdown(result.signalBreakdown, result.reasoning) + '\n');
    } catch (err) {
      errored++;
      process.stderr.write(`  [${i + 1}/${labeled}] ERROR: ${String(err)}\n`);
    }
  }

  // ---------------------------------------------------------------------------
  // Threshold sweep (post-hoc — D-06, no new API calls)
  // ---------------------------------------------------------------------------

  const thresholdRows: ThresholdRow[] = THRESHOLDS.map(t => computeMetrics(scored, t));

  // Best F1: highest non-null f1; ties → first
  let bestF1Threshold = detectionConfig.thresholds.flag;
  let bestF1Value: number | null = null;
  for (const row of thresholdRows) {
    if (row.f1 !== null && (bestF1Value === null || row.f1 > bestF1Value)) {
      bestF1Value = row.f1;
      bestF1Threshold = row.threshold;
    }
  }

  const scoredCount = scored.length;
  const avgUsdPerPost = scoredCount > 0 ? safe(totalCostUsd) / scoredCount : 0;

  // ---------------------------------------------------------------------------
  // Error analysis — FP/FN at bestF1Threshold (EVAL-07 / D-05)
  // IMPORTANT: always computed AFTER the sweep using bestF1Threshold (pitfall 4)
  // ---------------------------------------------------------------------------

  const falsePositives = filterErrors(details, bestF1Threshold, 'human');
  const falseNegatives = filterErrors(details, bestF1Threshold, 'ai');

  // ---------------------------------------------------------------------------
  // Build conformant EvalRun record (DATA-MODEL.md forward-compat guarantee #1)
  // ---------------------------------------------------------------------------

  const runAt = new Date().toISOString();
  const today = runAt.slice(0, 10);

  const results: EvalRun = {
    id: `${runAt}::${engine}`,
    runAt,
    source: 'cli',
    engine,
    model: engine === 'heuristic' ? 'heuristic' : MODEL,
    dataset: {
      source: 'file',
      label: filePath,
      total,
      labeled,
    },
    counts: {
      total,
      labeled,
      skipped,
      errored,
      scored: scoredCount,
    },
    cost: engine === 'heuristic'
      ? null
      : { totalUsd: safe(totalCostUsd), avgUsdPerPost },
    thresholds: thresholdRows,
    bestF1Threshold,
    errorAnalysis: {
      threshold: bestF1Threshold,
      falsePositives,
      falseNegatives,
    },
    posts: details,
  };

  // ---------------------------------------------------------------------------
  // Persist to eval/results-YYYY-MM-DD.json (EVAL-04)
  // The written object IS an EvalRun (DATA-MODEL.md forward-compat #1)
  // ---------------------------------------------------------------------------

  mkdirSync(EVAL_DIR, { recursive: true });
  const outFile = join(EVAL_DIR, `results-${today}.json`);
  writeFileSync(outFile, JSON.stringify(results, null, 2), 'utf8');

  // ---------------------------------------------------------------------------
  // Stdout: full table
  // ---------------------------------------------------------------------------

  const fmt2 = (n: number | null) => (n === null ? ' n/a' : n.toFixed(3));

  const header =
    '| threshold | precision | recall |   f1  | accuracy |';
  const separator =
    '|----------:|----------:|-------:|------:|---------:|';
  const tableRows = thresholdRows.map(r =>
    `|        ${r.threshold} | ${fmt2(r.precision).padStart(9)} | ${fmt2(r.recall).padStart(6)} | ${fmt2(r.f1).padStart(5)} | ${r.accuracy.toFixed(3).padStart(8)} |` +
    (r.threshold === bestF1Threshold ? ' <- best F1' : ''),
  );

  process.stdout.write('\n');
  process.stdout.write([header, separator, ...tableRows].join('\n') + '\n');

  // ---------------------------------------------------------------------------
  // Stdout: FP/FN error analysis section (EVAL-07)
  // Capped at top-5 per list; full counts shown; full lists in JSON
  // ---------------------------------------------------------------------------

  const topFP = falsePositives.slice(0, 5);
  const topFN = falseNegatives.slice(0, 5);

  if (topFP.length > 0 || topFN.length > 0) {
    process.stdout.write(`\nError analysis @T=${bestF1Threshold}:\n`);
    if (topFP.length > 0) {
      process.stdout.write(`\nFalse positives (${falsePositives.length} total — true human, predicted AI):\n`);
      for (const d of topFP) {
        process.stdout.write(`  [${d.index}] score=${d.score} "${d.textPreview}"\n`);
        // Print reasoning only for LLM engine (heuristic has no reasoning text)
        process.stdout.write(formatSignalBreakdown(d.signalBreakdown, engine === 'llm' ? d.reasoning : undefined) + '\n');
      }
    }
    if (topFN.length > 0) {
      process.stdout.write(`\nFalse negatives (${falseNegatives.length} total — true AI, predicted human):\n`);
      for (const d of topFN) {
        process.stdout.write(`  [${d.index}] score=${d.score} "${d.textPreview}"\n`);
        process.stdout.write(formatSignalBreakdown(d.signalBreakdown, engine === 'llm' ? d.reasoning : undefined) + '\n');
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Stdout: compact summary line
  // ---------------------------------------------------------------------------

  const bestRow = thresholdRows.find(r => r.threshold === bestF1Threshold)!;
  const costDisplay = engine === 'heuristic'
    ? 'cost: free'
    : `cost $${safe(totalCostUsd).toFixed(6)} total ($${avgUsdPerPost.toFixed(6)}/post)`;
  const summaryLine =
    `Eval ${today} [${engine}] | ${scoredCount} posts | ` +
    `best F1 @T=${bestF1Threshold} ` +
    `(P=${fmt2(bestRow.precision)} R=${fmt2(bestRow.recall)} F1=${fmt2(bestRow.f1)}) | ` +
    costDisplay;

  process.stdout.write('\n' + summaryLine + '\n');
  process.stdout.write(`\nResults written to: ${outFile}\n`);
}
