#!/usr/bin/env node
// Reads a labeled Export JSON (produced by the dashboard's Export JSON button),
// re-scores each labeled post through the shared LLM classifier, computes
// precision/recall/F1/accuracy across a threshold sweep (35–90 step 5),
// prints a full metrics table + compact summary, persists results to
// eval/results-YYYY-MM-DD.json, and exits non-zero on bad input.
// Run via: npm run eval <labeled-posts.json>
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { computeCostUsd } from '../src/shared/pricing.js';
import { classifyPost } from '../src/shared/classifier.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODEL = 'claude-sonnet-4-6';
const EVAL_DIR = join(__dirname, '../eval');
// 12 thresholds: 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90
const THRESHOLDS = Array.from({ length: 12 }, (_, i) => 35 + i * 5);

// ---------------------------------------------------------------------------
// Safe numeric guard (WR-01) — must not propagate NaN into any output
// ---------------------------------------------------------------------------

export const safe = (n: number): number => (Number.isFinite(n) ? n : 0);

// ---------------------------------------------------------------------------
// Metric computation (pure, exportable for tests — EVAL-03)
// ---------------------------------------------------------------------------

export interface ScoredEntry {
  label: 'ai' | 'human';
  score: number;
}

export interface ThresholdRow {
  threshold: number;
  tp: number;
  fp: number;
  tn: number;
  fn: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  accuracy: number;
}

/** Compute TP/FP/TN/FN and all four metrics at a single threshold. */
export function computeMetrics(scored: ScoredEntry[], threshold: number): ThresholdRow {
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;

  for (const entry of scored) {
    const predicted = entry.score >= threshold;
    const actual = entry.label === 'ai';
    if (predicted && actual) tp++;
    else if (predicted && !actual) fp++;
    else if (!predicted && actual) fn++;
    else tn++;
  }

  // Divide-by-zero guards — use null for undefined metrics, never NaN (T-26-09)
  const precision = (tp + fp) > 0 ? tp / (tp + fp) : null;
  const recall = (tp + fn) > 0 ? tp / (tp + fn) : null;
  const f1 =
    precision !== null && recall !== null && (precision + recall) > 0
      ? (2 * precision * recall) / (precision + recall)
      : null;
  const accuracy = (tp + fp + tn + fn) > 0 ? (tp + tn) / (tp + fp + tn + fn) : 0;

  return { threshold, tp, fp, tn, fn, precision, recall, f1, accuracy };
}

// ---------------------------------------------------------------------------
// Walker (pure, exportable for tests — EVAL-01)
// ---------------------------------------------------------------------------

export interface PostEntry {
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

    labeled.push({ text, label });
  }

  return { labeled, skipped };
}

// ---------------------------------------------------------------------------
// Per-post detail — surfaces the detector's per-signal breakdown + reasoning
// ---------------------------------------------------------------------------

export interface PostDetail {
  index: number;
  label: 'ai' | 'human';
  score: number;
  confidence: 'high' | 'medium' | 'low';
  signalBreakdown: Record<string, number>;
  reasoning?: string;
  /** First 80 chars of the post, so results-*.json is readable without the source export. */
  textPreview: string;
}

/**
 * Render a post's per-signal contributions (highest first) plus optional reasoning
 * as indented stdout lines. Returns `(no signals)` when the breakdown is empty.
 */
export function formatSignalBreakdown(
  breakdown: Record<string, number>,
  reasoning?: string,
): string {
  const entries = Object.entries(breakdown).sort((a, b) => b[1] - a[1]);
  const lines =
    entries.length === 0
      ? ['       (no signals)']
      : entries.map(([sig, val]) => `       ${sig.padEnd(26)} ${String(val).padStart(3)}`);
  if (reasoning) lines.push(`       reasoning: ${reasoning}`);
  return lines.join('\n');
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
 * Writes a clear stderr message and exits non-zero on any failure:
 * unreadable/unparseable file, valid-but-non-object JSON (CR-01: `null`, an
 * array, a bare number), or missing `flaggedPosts`/`unflaggedPosts` arrays.
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
  // 1. argv guard
  const filePath = process.argv[2];
  if (!filePath) {
    process.stderr.write('Usage: npm run eval <labeled-posts.json>\n');
    process.exit(1);
  }

  // 2. File read + JSON parse + shape/array validation (CR-01 guarded in loadExport)
  const parsed = loadExport(filePath);

  // 3. API key guard (EVAL-05, T-26-04 — key never printed)
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) {
    process.stderr.write('Error: ANTHROPIC_API_KEY environment variable is not set.\n');
    process.exit(1);
  }

  // 4. Walk flaggedPosts + unflaggedPosts only (D-07 / Phase 25.2 — top-level post-centric arrays)
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
  process.stdout.write(`\nEval: ${labeled} labeled posts (${skipped} unlabeled skipped, ${total} total).\n\n`);

  // 6. Sequential scoring loop — one LLM call per labeled post (D-08)
  const scored: ScoredEntry[] = [];
  const details: PostDetail[] = [];
  let totalCostUsd = 0;
  let errored = 0;

  for (let i = 0; i < labeledPosts.length; i++) {
    const post = labeledPosts[i];
    try {
      const { result, usage } = await classifyPost(post.text, apiKey);

      // Accumulate cost from real usage (D-08, never the stored score)
      if (usage) {
        const { costUsd } = computeCostUsd(MODEL, {
          input_tokens: safe(usage.input_tokens),
          output_tokens: safe(usage.output_tokens),
          cache_creation_input_tokens: safe(usage.cache_creation_input_tokens ?? 0),
          cache_read_input_tokens: safe(usage.cache_read_input_tokens ?? 0),
        });
        totalCostUsd += safe(costUsd);
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

      // Progress header — index/total + running cost (T-26-04: key never printed)
      process.stdout.write(
        `  [${i + 1}/${labeled}] score=${result.score} label=${post.label} confidence=${result.confidence}` +
        ` | running cost $${totalCostUsd.toFixed(6)}\n`,
      );
      // Per-signal breakdown + reasoning — why this post scored what it did
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
  let bestF1Threshold = THRESHOLDS[0];
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
  // Results object (T-26-04: no apiKey field)
  // ---------------------------------------------------------------------------

  const today = new Date().toISOString().slice(0, 10);

  const results = {
    runAt: new Date().toISOString(),
    inputFile: filePath,
    model: MODEL,
    counts: {
      total,
      labeled,
      skipped,
      errored,
      scored: scoredCount,
    },
    cost: {
      totalUsd: safe(totalCostUsd),
      avgUsdPerPost,
    },
    thresholds: thresholdRows,
    bestF1Threshold,
    posts: details,
  };

  // ---------------------------------------------------------------------------
  // Persist to eval/results-YYYY-MM-DD.json (EVAL-04, T-26-08)
  // ---------------------------------------------------------------------------

  mkdirSync(EVAL_DIR, { recursive: true });
  const outFile = join(EVAL_DIR, `results-${today}.json`);
  writeFileSync(outFile, JSON.stringify(results, null, 2), 'utf8');

  // ---------------------------------------------------------------------------
  // Stdout: full table + compact summary (EVAL-04)
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

  const bestRow = thresholdRows.find(r => r.threshold === bestF1Threshold)!;
  const summaryLine =
    `Eval ${today} | ${scoredCount} posts | ` +
    `best F1 @T=${bestF1Threshold} ` +
    `(P=${fmt2(bestRow.precision)} R=${fmt2(bestRow.recall)} F1=${fmt2(bestRow.f1)}) | ` +
    `cost $${safe(totalCostUsd).toFixed(6)} total ($${avgUsdPerPost.toFixed(6)}/post)`;

  process.stdout.write('\n' + summaryLine + '\n');
  process.stdout.write(`\nResults written to: ${outFile}\n`);
}
