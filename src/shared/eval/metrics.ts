/**
 * LinkedIn Blocker — Pure Eval Core (host-agnostic)
 *
 * This module contains the metric computation, signal formatting, and post-data
 * building functions that are shared between the eval CLI and the future
 * Phase 28 in-extension Evals dashboard.
 *
 * HOST-AGNOSTIC CONTRACT: This file MUST NOT import `fs`, `process`, `chrome.*`,
 * or any DOM API. Only `import type` from `../types` is permitted at runtime.
 * The eval CLI (scripts/eval.ts) and the dashboard (chrome + DOM, no Node fs)
 * both consume this module unchanged.
 *
 * Used by:
 *   - scripts/eval.ts            (CLI eval runner)
 *   - src/dashboard/evals.tsx    (deferred Phase 28 in-extension Evals page)
 */

import type { PostData } from '../types.js';

// ---------------------------------------------------------------------------
// Shared threshold sweep constant (D-03 — one constant, no drift)
// ---------------------------------------------------------------------------

/**
 * The canonical threshold sweep set for the eval harness.
 * Both the CLI (scripts/eval.ts) and the Phase 28 Evals dashboard import this
 * constant from the shared eval core — they can never drift apart (D-03).
 *
 * 12 thresholds: 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90
 */
export const THRESHOLDS: number[] = Array.from({ length: 12 }, (_, i) => 35 + i * 5);

// ---------------------------------------------------------------------------
// Safe numeric guard — must not propagate NaN into any output
// ---------------------------------------------------------------------------

export const safe = (n: number): number => (Number.isFinite(n) ? n : 0);

// ---------------------------------------------------------------------------
// Metric computation (pure — EVAL-03)
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
// Per-post detail type
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

// ---------------------------------------------------------------------------
// Signal breakdown formatter
// ---------------------------------------------------------------------------

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
// PostData builder — maps export entry fields to PostData (pure, no I/O)
// ---------------------------------------------------------------------------

/**
 * Build a PostData from an export entry record.
 * Maps `text` → `postText`, copies `urn`/`authorId`/`authorName` with '' defaults,
 * stubs `authorProfileUrl` (no signal uses it — verified in Phase 27 research A1).
 */
export function buildPostData(entry: Record<string, unknown>): PostData {
  const authorId = typeof entry['authorId'] === 'string' ? entry['authorId'] : 'unknown';
  return {
    urn: typeof entry['urn'] === 'string' ? entry['urn'] : '',
    authorId: typeof entry['authorId'] === 'string' ? entry['authorId'] : '',
    authorName: typeof entry['authorName'] === 'string' ? entry['authorName'] : '',
    authorProfileUrl: `https://www.linkedin.com/in/${authorId}/`,
    postText: typeof entry['text'] === 'string' ? entry['text'] : '',
  };
}

// ---------------------------------------------------------------------------
// Error analysis — FP/FN filters (pure, post-hoc — EVAL-07 / D-05)
// ---------------------------------------------------------------------------

/**
 * Filter post details at a threshold to find false positives (human predicted AI)
 * or false negatives (AI predicted human).
 *
 * IMPORTANT: Always call with `bestF1Threshold` AFTER the full threshold sweep —
 * never inside the scoring loop and never with a hard-coded threshold (pitfall 4).
 *
 * @param details   Per-post detail records from the scoring loop
 * @param threshold The best-F1 threshold (computed post-sweep)
 * @param label     'human' → FP filter; 'ai' → FN filter
 */
export function filterErrors(
  details: PostDetail[],
  threshold: number,
  label: 'ai' | 'human',
): PostDetail[] {
  if (label === 'human') {
    // False positives: true human, predicted AI (score >= threshold)
    return details.filter(d => d.label === 'human' && d.score >= threshold);
  }
  // False negatives: true AI, predicted human (score < threshold)
  return details.filter(d => d.label === 'ai' && d.score < threshold);
}
