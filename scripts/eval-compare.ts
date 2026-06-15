#!/usr/bin/env node
// Reads two EvalRun JSON files (produced by scripts/eval.ts) and prints a
// side-by-side comparison table covering engine, posts scored, best-F1 threshold,
// precision/recall/F1/accuracy, and cost.
// The diff is computed by the shared pure compareRuns() — terminal diffs and the
// future Phase 28 dashboard diffs share ONE implementation and can never drift.
// (DATA-MODEL.md forward-compat guarantee #2)
//
// Run via: npm run eval-compare -- <results-A.json> <results-B.json> [--format markdown]

import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  compareRuns,
  type EvalRun,
  type EvalRunComparison,
  type EvalRunSummary,
} from '../src/shared/eval/index.js';

// ---------------------------------------------------------------------------
// Null-safe number formatter (copied from eval.ts §fmt2 — one-liner, no import)
// ---------------------------------------------------------------------------

const fmt2 = (n: number | null): string => (n === null ? 'n/a' : n.toFixed(3));

// ---------------------------------------------------------------------------
// Cost formatter — renders null as 'free', number as '$X.XXXX'
// ---------------------------------------------------------------------------

function fmtCost(usd: number | null): string {
  if (usd === null) return 'free';
  return `$${usd.toFixed(4)}`;
}

// ---------------------------------------------------------------------------
// Row helpers
// ---------------------------------------------------------------------------

interface Row {
  label: string;
  current: string;
  baseline: string;
}

function metricRow(label: string, current: number | null, baseline: number | null): Row {
  return { label, current: fmt2(current), baseline: fmt2(baseline) };
}

function buildRows(cmp: EvalRunComparison, runA: EvalRun, runB: EvalRun): Row[] {
  const c: EvalRunSummary = cmp.current;
  const b: EvalRunSummary = cmp.baseline;

  // accuracy and avgCostPerPost come from the best-threshold row / cost of the full EvalRun
  const bestA = runA.thresholds.find(t => t.threshold === runA.bestF1Threshold) ?? null;
  const bestB = runB.thresholds.find(t => t.threshold === runB.bestF1Threshold) ?? null;
  const accA = bestA !== null ? bestA.accuracy : null;
  const accB = bestB !== null ? bestB.accuracy : null;
  const avgCostA = runA.cost?.avgUsdPerPost ?? null;
  const avgCostB = runB.cost?.avgUsdPerPost ?? null;

  return [
    { label: 'Engine',           current: c.engine,                baseline: b.engine },
    { label: 'Posts scored',     current: String(runA.counts.scored), baseline: String(runB.counts.scored) },
    { label: 'Best F1 @T',       current: String(c.bestF1Threshold),  baseline: String(b.bestF1Threshold) },
    metricRow('Precision',   c.precision, b.precision),
    metricRow('Recall',      c.recall,    b.recall),
    metricRow('F1',          c.f1,        b.f1),
    metricRow('Accuracy',    accA,        accB),
    { label: 'Total cost',       current: fmtCost(c.costUsd),    baseline: fmtCost(b.costUsd) },
    { label: 'Avg cost/post',    current: fmtCost(avgCostA),     baseline: fmtCost(avgCostB) },
  ];
}

// ---------------------------------------------------------------------------
// Render: terminal (two-column, padded)
// ---------------------------------------------------------------------------

export function renderTerminal(cmp: EvalRunComparison, runA?: EvalRun, runB?: EvalRun): string {
  const rows = runA && runB ? buildRows(cmp, runA, runB) : buildRowsFromSummaries(cmp);
  const labelW = Math.max(...rows.map(r => r.label.length), 'Metric'.length);
  const curW   = Math.max(...rows.map(r => r.current.length), 'Current'.length);
  const baseW  = Math.max(...rows.map(r => r.baseline.length), 'Baseline'.length);

  const header = `${'Metric'.padEnd(labelW)}  ${'Current'.padStart(curW)}  ${'Baseline'.padStart(baseW)}`;
  const sep    = '-'.repeat(header.length);
  const dataLines = rows.map(r =>
    `${r.label.padEnd(labelW)}  ${r.current.padStart(curW)}  ${r.baseline.padStart(baseW)}`,
  );
  return [header, sep, ...dataLines].join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Render: GitHub-flavored markdown table
// ---------------------------------------------------------------------------

export function renderMarkdown(cmp: EvalRunComparison, runA?: EvalRun, runB?: EvalRun): string {
  const rows = runA && runB ? buildRows(cmp, runA, runB) : buildRowsFromSummaries(cmp);
  const header = '| Metric | Current | Baseline |';
  const sep    = '|--------|---------|----------|';
  const dataLines = rows.map(r => `| ${r.label} | ${r.current} | ${r.baseline} |`);
  return [header, sep, ...dataLines].join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Summary-only row builder (used when full EvalRun not available, e.g. in tests)
// ---------------------------------------------------------------------------

function buildRowsFromSummaries(cmp: EvalRunComparison): Row[] {
  const c: EvalRunSummary = cmp.current;
  const b: EvalRunSummary = cmp.baseline;
  return [
    { label: 'Engine',        current: c.engine,                  baseline: b.engine },
    { label: 'Best F1 @T',    current: String(c.bestF1Threshold),  baseline: String(b.bestF1Threshold) },
    metricRow('Precision',    c.precision, b.precision),
    metricRow('Recall',       c.recall,    b.recall),
    metricRow('F1',           c.f1,        b.f1),
    { label: 'Total cost',    current: fmtCost(c.costUsd),        baseline: fmtCost(b.costUsd) },
  ];
}

// ---------------------------------------------------------------------------
// File loader — wraps readFileSync + JSON.parse in try/catch (T-27-07)
// ---------------------------------------------------------------------------

function loadRun(filePath: string): EvalRun {
  try {
    const raw = readFileSync(resolve(filePath), 'utf8');
    return JSON.parse(raw) as EvalRun;
  } catch {
    process.stderr.write(`Error: Could not read or parse file: ${filePath}\n`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// main() — thin CLI wrapper: parse args → load → compare → render
// ---------------------------------------------------------------------------

export function main(): void {
  // Separate file paths from flags
  const args = process.argv.slice(2);
  const files = args.filter(a => !a.startsWith('--'));
  const markdownMode = args.includes('--format') && args[args.indexOf('--format') + 1] === 'markdown';

  const [fileA, fileB] = files;
  if (!fileA || !fileB) {
    process.stderr.write(
      'Usage: npm run eval-compare -- <results-A.json> <results-B.json> [--format markdown]\n',
    );
    process.exit(1);
  }

  // Load both files (A = current, B = baseline)
  const runA = loadRun(fileA);
  const runB = loadRun(fileB);

  // Delegate ALL diff arithmetic to the shared pure function (DATA-MODEL.md guarantee #2)
  const comparison = compareRuns(runA, runB);

  // Render
  const output = markdownMode
    ? renderMarkdown(comparison, runA, runB)
    : renderTerminal(comparison, runA, runB);

  process.stdout.write(output);
}

// ---------------------------------------------------------------------------
// CLI entry guard
// ---------------------------------------------------------------------------

const isMain =
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith('eval-compare.ts') || process.argv[1].endsWith('eval-compare.js'));

if (isMain) {
  main();
}
