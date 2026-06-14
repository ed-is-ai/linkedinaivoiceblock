/**
 * Unit tests for scripts/eval.ts — walker, metric guards, exit codes.
 *
 * Requirements: EVAL-01 (walker), EVAL-03 (metrics), EVAL-05 (exit codes).
 *
 * Strategy:
 *   - collectLabeled() and computeMetrics() are pure exported functions —
 *     tested directly without any I/O or network.
 *   - fs is mocked so no real disk reads/writes occur.
 *   - fetch is stubbed so no real network calls occur.
 *   - CLI exit-code paths are tested by importing main indirectly via a
 *     wrapper that captures process.exit throws.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// fetch stub — no real network calls (the guard tests below exit before any
// scoring, but keep the stub so an accidental classifyPost never hits the wire)
// ---------------------------------------------------------------------------

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

// ---------------------------------------------------------------------------
// Imports under test. The eval CLI reads input through the real fs, so the
// EVAL-05 guard tests below drive it with real temp files rather than mocking
// the `fs` module (eval.ts's `fs` import does not pick up a vi.mock('fs')).
// ---------------------------------------------------------------------------

import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectLabeled, computeMetrics, safe, loadExport, main } from './eval';

// ---------------------------------------------------------------------------
// EVAL-01: Walker
// ---------------------------------------------------------------------------

describe('collectLabeled (EVAL-01)', () => {
  it('returns only labeled entries from flaggedPosts and unflaggedPosts', () => {
    const flaggedPosts = [
      { text: 'AI post', label: 'ai', score: 80 },
      { text: 'Human post', label: 'human', score: 10 },
      { text: 'Unlabeled post', score: 50 },          // no label — should be skipped
    ];
    const unflaggedPosts = [
      { text: 'Another human', label: 'human', score: 20 },
      { text: 'No label here', score: 30 },           // no label — should be skipped
    ];

    const { labeled, skipped } = collectLabeled(flaggedPosts, unflaggedPosts);

    expect(labeled).toHaveLength(3);
    expect(labeled[0]).toEqual({ text: 'AI post', label: 'ai' });
    expect(labeled[1]).toEqual({ text: 'Human post', label: 'human' });
    expect(labeled[2]).toEqual({ text: 'Another human', label: 'human' });
    expect(skipped).toBe(2);
  });

  it('skips null and non-object entries without throwing', () => {
    const flaggedPosts = [null, 'string-entry', 42, { text: 'Valid', label: 'ai' }];
    const unflaggedPosts: unknown[] = [];

    const { labeled, skipped } = collectLabeled(flaggedPosts, unflaggedPosts);

    // null and primitive entries are skipped but NOT counted as unlabeled (they're non-object)
    expect(labeled).toHaveLength(1);
    expect(labeled[0]).toEqual({ text: 'Valid', label: 'ai' });
    // skipped only counts missing-label entries, not bad-shape entries
    expect(skipped).toBe(0);
  });

  it('skips entries with invalid label values', () => {
    const flaggedPosts = [
      { text: 'Bad label', label: 'maybe' },
      { text: 'Good label', label: 'human' },
    ];

    const { labeled, skipped } = collectLabeled(flaggedPosts, []);

    expect(labeled).toHaveLength(1);
    expect(labeled[0]!.label).toBe('human');
    expect(skipped).toBe(1);
  });

  it('returns empty labeled and zero skipped on empty input', () => {
    const { labeled, skipped } = collectLabeled([], []);
    expect(labeled).toHaveLength(0);
    expect(skipped).toBe(0);
  });

  it('does NOT read from flaggedAccounts — only the two top-level arrays', () => {
    // Hypothetical input with a (legacy) flaggedAccounts key — must be ignored
    const flaggedPosts = [{ text: 'Real post', label: 'ai' }];
    const unflaggedPosts: unknown[] = [];
    // The walker signature only accepts the two arrays — flaggedAccounts is not a parameter
    // and is structurally impossible to accidentally walk.
    const { labeled } = collectLabeled(flaggedPosts, unflaggedPosts);
    expect(labeled).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// EVAL-03: Metrics — divide-by-zero guards, null not NaN
// ---------------------------------------------------------------------------

describe('computeMetrics (EVAL-03)', () => {
  it('computes TP/FP/TN/FN and all four metrics correctly for a simple fixture', () => {
    // 3 ai posts, 2 human posts, threshold 50
    const scored = [
      { label: 'ai' as const, score: 80 },   // TP
      { label: 'ai' as const, score: 60 },   // TP
      { label: 'ai' as const, score: 30 },   // FN
      { label: 'human' as const, score: 70 }, // FP
      { label: 'human' as const, score: 20 }, // TN
    ];

    const row = computeMetrics(scored, 50);

    expect(row.threshold).toBe(50);
    expect(row.tp).toBe(2);
    expect(row.fp).toBe(1);
    expect(row.tn).toBe(1);
    expect(row.fn).toBe(1);

    // precision = 2/(2+1) = 0.667
    expect(row.precision).toBeCloseTo(2 / 3, 5);
    // recall = 2/(2+1) = 0.667
    expect(row.recall).toBeCloseTo(2 / 3, 5);
    // f1 = 2*0.667*0.667/(0.667+0.667) = 0.667
    expect(row.f1).toBeCloseTo(2 / 3, 5);
    // accuracy = (2+1)/(2+1+1+1) = 3/5 = 0.6
    expect(row.accuracy).toBeCloseTo(0.6, 5);
  });

  it('yields precision === null when no posts are predicted positive (divide-by-zero guard)', () => {
    // All scores below threshold → TP=0, FP=0 → precision undefined
    const scored = [
      { label: 'ai' as const, score: 20 },
      { label: 'human' as const, score: 10 },
    ];

    const row = computeMetrics(scored, 50);

    expect(row.tp).toBe(0);
    expect(row.fp).toBe(0);
    expect(row.precision).toBeNull();
    // JSON.stringify should emit null, not NaN
    const json = JSON.stringify(row);
    expect(json).not.toContain('NaN');
  });

  it('yields recall === null when there are no actual positives (divide-by-zero guard)', () => {
    // All labels are human → TP=0, FN=0 → recall undefined
    const scored = [
      { label: 'human' as const, score: 80 },
      { label: 'human' as const, score: 20 },
    ];

    const row = computeMetrics(scored, 50);

    expect(row.tp).toBe(0);
    expect(row.fn).toBe(0);
    expect(row.recall).toBeNull();
    expect(row.f1).toBeNull();
    const json = JSON.stringify(row);
    expect(json).not.toContain('NaN');
  });

  it('yields f1 === null when precision and recall are both null', () => {
    const scored: Array<{ label: 'ai' | 'human'; score: number }> = [];
    const row = computeMetrics(scored, 50);

    expect(row.precision).toBeNull();
    expect(row.recall).toBeNull();
    expect(row.f1).toBeNull();
    expect(row.accuracy).toBe(0); // empty → 0, not NaN
    const json = JSON.stringify(row);
    expect(json).not.toContain('NaN');
  });

  it('JSON.stringify of a row with null metrics contains no NaN', () => {
    // All human posts below threshold → TP=0, FP=0, TN=1, FN=0
    // precision = null (TP+FP=0), recall = null (TP+FN=0), f1 = null
    const scored = [{ label: 'human' as const, score: 20 }];
    const row = computeMetrics(scored, 50);
    const json = JSON.stringify(row);
    expect(json).not.toContain('NaN');
    // precision is null (no predicted positives), recall is null (no actual positives)
    expect(JSON.parse(json)).toMatchObject({ precision: null, recall: null, f1: null });
  });
});

// ---------------------------------------------------------------------------
// safe() guard
// ---------------------------------------------------------------------------

describe('safe()', () => {
  it('passes through finite numbers unchanged', () => {
    expect(safe(0)).toBe(0);
    expect(safe(1.5)).toBe(1.5);
    expect(safe(-42)).toBe(-42);
  });

  it('converts NaN to 0', () => {
    expect(safe(NaN)).toBe(0);
  });

  it('converts Infinity to 0', () => {
    expect(safe(Infinity)).toBe(0);
    expect(safe(-Infinity)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// EVAL-05: bad-input exit codes — loadExport() + main() guard paths
//
// process.exit is stubbed to throw a sentinel so execution halts at each guard
// exactly as it would in the real CLI, and the thrown code is asserted.
// ---------------------------------------------------------------------------

const EXIT = '__exit__';

/** Create a real temp dir for fixture files and clean it up after each test. */
function useTempDir() {
  const ctx = { dir: '' };
  beforeEach(() => {
    ctx.dir = mkdtempSync(join(tmpdir(), 'llb-eval-'));
  });
  afterEach(() => {
    rmSync(ctx.dir, { recursive: true, force: true });
  });
  return ctx;
}

/**
 * Stub process.exit to throw a sentinel so execution halts at each guard, plus
 * silence stderr (and optionally stdout). Spies are (re)created per test so each
 * one gets a fresh call history.
 */
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

describe('loadExport (EVAL-05 — file/parse/shape guards)', () => {
  const tmp = useTempDir();
  const spies = stubExitAndStreams();

  const writeFixture = (name: string, content: string): string => {
    const p = join(tmp.dir, name);
    writeFileSync(p, content, 'utf8');
    return p;
  };

  it('exits 1 when the file cannot be read', () => {
    const missing = join(tmp.dir, 'does-not-exist.json');
    expect(() => loadExport(missing)).toThrow(`${EXIT}1`);
    expect(spies.stderr).toHaveBeenCalledWith(expect.stringContaining('Could not read or parse file'));
  });

  it('exits 1 on unparseable JSON', () => {
    const p = writeFixture('bad.json', 'this is not json');
    expect(() => loadExport(p)).toThrow(`${EXIT}1`);
  });

  it('exits 1 on valid JSON that is `null` (CR-01 regression)', () => {
    const p = writeFixture('null.json', 'null');
    expect(() => loadExport(p)).toThrow(`${EXIT}1`);
    expect(spies.stderr).toHaveBeenCalledWith(expect.stringContaining('Could not read or parse file'));
  });

  it('exits 1 on valid JSON that is an array (non-object shape)', () => {
    const p = writeFixture('array.json', '[]');
    expect(() => loadExport(p)).toThrow(`${EXIT}1`);
  });

  it('exits 1 when flaggedPosts / unflaggedPosts are not both arrays', () => {
    const p = writeFixture('partial.json', JSON.stringify({ flaggedPosts: [] }));
    expect(() => loadExport(p)).toThrow(`${EXIT}1`);
    expect(spies.stderr).toHaveBeenCalledWith(expect.stringContaining('flaggedPosts'));
  });

  it('returns the two arrays on a well-formed export', () => {
    const p = writeFixture(
      'good.json',
      JSON.stringify({ flaggedPosts: [{ text: 't', label: 'ai' }], unflaggedPosts: [] }),
    );
    const out = loadExport(p);
    expect(out.flaggedPosts).toHaveLength(1);
    expect(out.unflaggedPosts).toHaveLength(0);
  });
});

describe('main (EVAL-05 — argv / api-key / no-label guards)', () => {
  const tmp = useTempDir();
  const spies = stubExitAndStreams({ stdout: true });
  const origArgv = process.argv;
  const origKey = process.env['ANTHROPIC_API_KEY'];

  afterEach(() => {
    process.argv = origArgv;
    if (origKey === undefined) delete process.env['ANTHROPIC_API_KEY'];
    else process.env['ANTHROPIC_API_KEY'] = origKey;
  });

  const writeFixture = (content: object): string => {
    const p = join(tmp.dir, 'export.json');
    writeFileSync(p, JSON.stringify(content), 'utf8');
    return p;
  };

  it('exits 1 when no input file argument is supplied', async () => {
    process.argv = ['node', 'eval.ts'];
    await expect(main()).rejects.toThrow(`${EXIT}1`);
    expect(spies.stderr).toHaveBeenCalledWith(expect.stringContaining('Usage:'));
  });

  it('exits 1 when ANTHROPIC_API_KEY is not set', async () => {
    const p = writeFixture({ flaggedPosts: [], unflaggedPosts: [] });
    process.argv = ['node', 'eval.ts', p];
    delete process.env['ANTHROPIC_API_KEY'];
    await expect(main()).rejects.toThrow(`${EXIT}1`);
    expect(spies.stderr).toHaveBeenCalledWith(expect.stringContaining('ANTHROPIC_API_KEY'));
  });

  it('exits 1 when the export contains no labeled posts', async () => {
    const p = writeFixture({ flaggedPosts: [{ text: 'no label' }], unflaggedPosts: [] });
    process.argv = ['node', 'eval.ts', p];
    process.env['ANTHROPIC_API_KEY'] = 'sk-test';
    await expect(main()).rejects.toThrow(`${EXIT}1`);
    expect(spies.stderr).toHaveBeenCalledWith(expect.stringContaining('No labeled posts'));
  });
});
