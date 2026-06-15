/**
 * CLI tests for scripts/eval-compare.ts
 *
 * Requirements: EVAL-09 (D-07: terminal and --format markdown comparison; bad-input exit codes)
 *
 * Strategy:
 *   - describe('eval-compare render'): call renderTerminal/renderMarkdown with in-memory
 *     EvalRunComparison fixtures to verify output format without touching the filesystem.
 *   - describe('main (eval-compare guards)'): call main() with real temp files to verify
 *     exit-code behaviour on bad input (fewer-than-two-args, unreadable file, bad JSON).
 *   - Pure diff math is covered by src/shared/eval/runs.test.ts — not duplicated here.
 *   - No network stubs needed (eval-compare makes zero network calls).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Subject-under-test imports (loaded lazily inside each test so vi.spyOn
// captures process.exit before the module runs its isMain guard)
// ---------------------------------------------------------------------------

import { renderTerminal, renderMarkdown, main } from './eval-compare';
import type { EvalRunComparison, EvalRunSummary } from '../src/shared/eval/index';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeSummary(overrides: Partial<EvalRunSummary> = {}): EvalRunSummary {
  return {
    id: 'run-a::heuristic',
    runAt: '2026-06-15T00:00:00.000Z',
    engine: 'heuristic',
    model: 'heuristic',
    datasetLabel: 'test-dataset',
    bestF1Threshold: 50,
    f1: 0.72,
    precision: 0.75,
    recall: 0.69,
    costUsd: null,
    fpCount: 2,
    fnCount: 1,
    ...overrides,
  };
}

function makeDelta(current: number | null, baseline: number | null) {
  return {
    current,
    baseline,
    delta: current !== null && baseline !== null ? current - baseline : null,
  };
}

/** A minimal EvalRunComparison fixture (heuristic current vs LLM baseline). */
const CMP_FIXTURE: EvalRunComparison = {
  current: makeSummary({
    id: 'run-b::heuristic',
    engine: 'heuristic',
    model: 'heuristic',
    bestF1Threshold: 50,
    f1: 0.8,
    precision: 0.82,
    recall: 0.78,
    costUsd: null, // free
  }),
  baseline: makeSummary({
    id: 'run-a::llm',
    engine: 'llm',
    model: 'claude-sonnet-4-6',
    bestF1Threshold: 45,
    f1: 0.72,
    precision: 0.75,
    recall: 0.69,
    costUsd: 0.0148,
  }),
  f1: makeDelta(0.8, 0.72),
  precision: makeDelta(0.82, 0.75),
  recall: makeDelta(0.78, 0.69),
  cost: makeDelta(null, 0.0148),
  perThreshold: [],
};

// ---------------------------------------------------------------------------
// Temp dir + exit/stream stubs (copied from eval.test.ts, minus fetch stub)
// ---------------------------------------------------------------------------

const EXIT = '__exit__';

function useTempDir() {
  const ctx = { dir: '' };
  beforeEach(() => {
    ctx.dir = mkdtempSync(join(tmpdir(), 'llb-eval-compare-'));
  });
  afterEach(() => {
    rmSync(ctx.dir, { recursive: true, force: true });
  });
  return ctx;
}

function stubExitAndStreams(streams: { stdout?: boolean } = {}) {
  const spies: {
    exit: ReturnType<typeof vi.spyOn>;
    stderr: ReturnType<typeof vi.spyOn>;
    stdout?: ReturnType<typeof vi.spyOn>;
  } = { exit: undefined as never, stderr: undefined as never };
  beforeEach(() => {
    spies.exit = vi.spyOn(process, 'exit').mockImplementation((code?: number): never => {
      throw new Error(`${EXIT}${code}`);
    });
    spies.stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    if (streams.stdout) {
      spies.stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    }
  });
  afterEach(() => {
    spies.exit.mockRestore();
    spies.stderr.mockRestore();
    spies.stdout?.mockRestore();
  });
  return spies;
}

// ---------------------------------------------------------------------------
// Minimal EvalRun JSON — the full shape required by EvalRun
// ---------------------------------------------------------------------------

function makeRunJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: 'run-a::heuristic',
    runAt: '2026-06-15T00:00:00.000Z',
    source: 'cli',
    engine: 'heuristic',
    model: 'heuristic',
    dataset: { source: 'file', label: 'test', total: 10, labeled: 10 },
    counts: { total: 10, labeled: 10, skipped: 0, errored: 0, scored: 10 },
    cost: null,
    thresholds: [{ threshold: 50, tp: 5, fp: 1, tn: 3, fn: 1, precision: 0.83, recall: 0.83, f1: 0.83, accuracy: 0.8 }],
    bestF1Threshold: 50,
    errorAnalysis: { threshold: 50, falsePositives: [], falseNegatives: [] },
    posts: [],
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// describe('eval-compare render')
// ---------------------------------------------------------------------------

describe('eval-compare render', () => {
  it('renderTerminal produces a two-column table with both engine labels', () => {
    const output = renderTerminal(CMP_FIXTURE);
    expect(output).toContain('heuristic');
    expect(output).toContain('llm');
  });

  it('renderTerminal shows the bestF1Threshold for both runs', () => {
    const output = renderTerminal(CMP_FIXTURE);
    expect(output).toContain('50');
    expect(output).toContain('45');
  });

  it('renderTerminal shows f1/precision/recall metric values', () => {
    const output = renderTerminal(CMP_FIXTURE);
    expect(output).toContain('0.800');
    expect(output).toContain('0.720');
  });

  it('renderTerminal renders costUsd === null as "free" (not "$null" or NaN)', () => {
    const output = renderTerminal(CMP_FIXTURE);
    expect(output).toContain('free');
    expect(output).not.toContain('$null');
    expect(output).not.toContain('NaN');
  });

  it('renderTerminal renders a non-null cost as a $ amount', () => {
    const output = renderTerminal(CMP_FIXTURE);
    expect(output).toContain('$0.0148');
  });

  it('renderMarkdown produces a GitHub-flavored markdown table', () => {
    const output = renderMarkdown(CMP_FIXTURE);
    expect(output).toContain('|');
    expect(output).toMatch(/\|[-:]+\|/); // separator row
  });

  it('renderMarkdown includes both engine labels', () => {
    const output = renderMarkdown(CMP_FIXTURE);
    expect(output).toContain('heuristic');
    expect(output).toContain('llm');
  });

  it('renderMarkdown renders costUsd === null as "free"', () => {
    const output = renderMarkdown(CMP_FIXTURE);
    expect(output).toContain('free');
    expect(output).not.toContain('$null');
    expect(output).not.toContain('NaN');
  });

  it('renderMarkdown does not crash and emits no NaN with all-null metrics', () => {
    const nullCmp: EvalRunComparison = {
      ...CMP_FIXTURE,
      current: { ...CMP_FIXTURE.current, f1: null, precision: null, recall: null, costUsd: null },
      baseline: { ...CMP_FIXTURE.baseline, f1: null, precision: null, recall: null, costUsd: null },
      f1: { current: null, baseline: null, delta: null },
      precision: { current: null, baseline: null, delta: null },
      recall: { current: null, baseline: null, delta: null },
      cost: { current: null, baseline: null, delta: null },
    };
    const output = renderMarkdown(nullCmp);
    expect(output).not.toContain('NaN');
  });
});

// ---------------------------------------------------------------------------
// describe('main (eval-compare guards)')
// ---------------------------------------------------------------------------

describe('main (eval-compare guards)', () => {
  const tmp = useTempDir();
  const spies = stubExitAndStreams({ stdout: true });

  it('exits 1 with a usage message when fewer than two file args are supplied', () => {
    const origArgv = process.argv;
    process.argv = ['node', 'eval-compare.ts']; // zero file args
    try {
      expect(() => main()).toThrow(`${EXIT}1`);
    } finally {
      process.argv = origArgv;
    }
    const stderrCalls = spies.stderr.mock.calls.map(c => c[0] as string);
    expect(stderrCalls.some(s => s.includes('Usage'))).toBe(true);
  });

  it('exits 1 when the first file does not exist', () => {
    const origArgv = process.argv;
    process.argv = ['node', 'eval-compare.ts', '/nonexistent/a.json', '/nonexistent/b.json'];
    try {
      expect(() => main()).toThrow(`${EXIT}1`);
    } finally {
      process.argv = origArgv;
    }
    const stderrCalls = spies.stderr.mock.calls.map(c => c[0] as string);
    expect(stderrCalls.some(s => s.toLowerCase().includes('error'))).toBe(true);
  });

  it('exits 1 when a file contains invalid JSON', () => {
    const fileA = join(tmp.dir, 'bad.json');
    const fileB = join(tmp.dir, 'good.json');
    writeFileSync(fileA, 'not-json', 'utf8');
    writeFileSync(fileB, makeRunJson(), 'utf8');
    const origArgv = process.argv;
    process.argv = ['node', 'eval-compare.ts', fileA, fileB];
    try {
      expect(() => main()).toThrow(`${EXIT}1`);
    } finally {
      process.argv = origArgv;
    }
    const stderrCalls = spies.stderr.mock.calls.map(c => c[0] as string);
    expect(stderrCalls.some(s => s.toLowerCase().includes('error'))).toBe(true);
  });

  it('exits 0 and writes output when given two valid EvalRun files', () => {
    const fileA = join(tmp.dir, 'a.json');
    const fileB = join(tmp.dir, 'b.json');
    writeFileSync(fileA, makeRunJson({ engine: 'heuristic', id: 'run-a::heuristic' }), 'utf8');
    writeFileSync(fileB, makeRunJson({ engine: 'heuristic', id: 'run-b::heuristic' }), 'utf8');
    const origArgv = process.argv;
    process.argv = ['node', 'eval-compare.ts', fileA, fileB];
    try {
      main();
    } finally {
      process.argv = origArgv;
    }
    const stdoutCalls = spies.stdout!.mock.calls.map(c => c[0] as string);
    expect(stdoutCalls.join('')).toBeTruthy();
  });

  it('exits 0 and uses markdown format when --format markdown is passed', () => {
    const fileA = join(tmp.dir, 'a.json');
    const fileB = join(tmp.dir, 'b.json');
    writeFileSync(fileA, makeRunJson(), 'utf8');
    writeFileSync(fileB, makeRunJson(), 'utf8');
    const origArgv = process.argv;
    process.argv = ['node', 'eval-compare.ts', fileA, fileB, '--format', 'markdown'];
    try {
      main();
    } finally {
      process.argv = origArgv;
    }
    const stdoutCalls = spies.stdout!.mock.calls.map(c => c[0] as string);
    const combined = stdoutCalls.join('');
    expect(combined).toContain('|');
    expect(combined).toMatch(/\|[-:]+\|/);
  });
});
