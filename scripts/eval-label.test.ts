/**
 * Unit tests for scripts/eval-label.ts — applyLabel helper, CLI guards, --auto mode.
 *
 * Requirements: EVAL-08 (labeling workflow, D-06).
 *
 * Strategy:
 *   - applyLabel() is a pure exported function — tested directly.
 *   - main() exit-code paths are tested with real temp files + process.argv manipulation.
 *   - Interactive raw-mode keypath is NOT tested in CI (non-TTY guard fires first).
 *   - --auto integration test: write fixture, run main(), assert labels in written-back JSON.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyLabel, main } from './eval-label';

// ---------------------------------------------------------------------------
// Helpers (copied verbatim from eval.test.ts — useTempDir + stubExitAndStreams)
// ---------------------------------------------------------------------------

const EXIT = '__exit__';

/** Create a real temp dir for fixture files and clean it up after each test. */
function useTempDir() {
  const ctx = { dir: '' };
  beforeEach(() => {
    ctx.dir = mkdtempSync(join(tmpdir(), 'llb-eval-label-'));
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

// ---------------------------------------------------------------------------
// applyLabel — pure helper tests
// ---------------------------------------------------------------------------

describe('applyLabel', () => {
  it('adds a label field to a flaggedPosts entry', () => {
    const data = {
      flaggedPosts: [{ urn: 'urn:1', authorId: 'alice', text: 'Hello', score: 80 }],
      unflaggedPosts: [] as unknown[],
    };
    applyLabel(data, 'flaggedPosts', 0, 'ai');
    expect((data.flaggedPosts[0] as Record<string, unknown>)['label']).toBe('ai');
  });

  it('adds a label field to an unflaggedPosts entry', () => {
    const data = {
      flaggedPosts: [] as unknown[],
      unflaggedPosts: [{ urn: 'urn:2', text: 'World', score: 10 }],
    };
    applyLabel(data, 'unflaggedPosts', 0, 'human');
    expect((data.unflaggedPosts[0] as Record<string, unknown>)['label']).toBe('human');
  });

  it('is idempotent — labeling the same entry twice writes the second value', () => {
    const data = {
      flaggedPosts: [{ text: 'post', label: 'ai' }],
      unflaggedPosts: [] as unknown[],
    };
    applyLabel(data, 'flaggedPosts', 0, 'ai');
    applyLabel(data, 'flaggedPosts', 0, 'ai');
    expect((data.flaggedPosts[0] as Record<string, unknown>)['label']).toBe('ai');
  });

  it('overwrites an existing label when called with a new value', () => {
    const data = {
      flaggedPosts: [{ text: 'post', label: 'human' }],
      unflaggedPosts: [] as unknown[],
    };
    applyLabel(data, 'flaggedPosts', 0, 'ai');
    expect((data.flaggedPosts[0] as Record<string, unknown>)['label']).toBe('ai');
  });

  it('preserves all other fields on the entry when adding a label', () => {
    const data = {
      flaggedPosts: [{ urn: 'urn:1', authorId: 'alice', text: 'Hello', score: 75 }],
      unflaggedPosts: [] as unknown[],
    };
    applyLabel(data, 'flaggedPosts', 0, 'ai');
    const entry = data.flaggedPosts[0] as Record<string, unknown>;
    expect(entry['urn']).toBe('urn:1');
    expect(entry['authorId']).toBe('alice');
    expect(entry['text']).toBe('Hello');
    expect(entry['score']).toBe(75);
    expect(entry['label']).toBe('ai');
    // No extra keys beyond the original fields plus 'label'
    expect(Object.keys(entry).sort()).toEqual(['authorId', 'label', 'score', 'text', 'urn'].sort());
  });
});

// ---------------------------------------------------------------------------
// main (eval-label guards) — exit-code paths
// ---------------------------------------------------------------------------

describe('main (eval-label guards)', () => {
  const tmp = useTempDir();
  const spies = stubExitAndStreams({ stdout: true });
  const origArgv = process.argv;

  afterEach(() => {
    process.argv = origArgv;
  });

  it('exits 1 when no file argument is supplied', async () => {
    process.argv = ['node', 'eval-label.ts'];
    await expect(main()).rejects.toThrow(`${EXIT}1`);
    expect(spies.stderr).toHaveBeenCalledWith(expect.stringContaining('Usage:'));
  });

  it('exits 1 when the file cannot be read', async () => {
    process.argv = ['node', 'eval-label.ts', join(tmp.dir, 'does-not-exist.json')];
    await expect(main()).rejects.toThrow(`${EXIT}1`);
    expect(spies.stderr).toHaveBeenCalledWith(expect.stringContaining('Could not read or parse'));
  });

  it('exits 1 when the file is not a JSON object (array root)', async () => {
    const p = join(tmp.dir, 'bad.json');
    writeFileSync(p, '[]', 'utf8');
    process.argv = ['node', 'eval-label.ts', p];
    await expect(main()).rejects.toThrow(`${EXIT}1`);
  });

  it('exits 1 when the file is missing flaggedPosts or unflaggedPosts', async () => {
    const p = join(tmp.dir, 'partial.json');
    writeFileSync(p, JSON.stringify({ flaggedPosts: [] }), 'utf8');
    process.argv = ['node', 'eval-label.ts', p];
    await expect(main()).rejects.toThrow(`${EXIT}1`);
    expect(spies.stderr).toHaveBeenCalledWith(expect.stringContaining('flaggedPosts'));
  });
});

// ---------------------------------------------------------------------------
// --auto integration tests
// ---------------------------------------------------------------------------

describe('main --auto mode', () => {
  const tmp = useTempDir();
  const spies = stubExitAndStreams({ stdout: true });
  const origArgv = process.argv;

  afterEach(() => {
    process.argv = origArgv;
  });

  it('bulk-labels unlabeled flaggedPosts as ai and unflaggedPosts as human', async () => {
    const fixture = {
      flaggedPosts: [{ text: 'AI post', score: 80 }, { text: 'Another AI', score: 70 }],
      unflaggedPosts: [{ text: 'Human post', score: 10 }],
    };
    const p = join(tmp.dir, 'export.json');
    writeFileSync(p, JSON.stringify(fixture), 'utf8');

    process.argv = ['node', 'eval-label.ts', p, '--auto'];
    await expect(main()).rejects.toThrow(`${EXIT}0`);

    const written = JSON.parse(readFileSync(p, 'utf8')) as {
      flaggedPosts: Array<Record<string, unknown>>;
      unflaggedPosts: Array<Record<string, unknown>>;
    };
    expect(written.flaggedPosts[0]?.['label']).toBe('ai');
    expect(written.flaggedPosts[1]?.['label']).toBe('ai');
    expect(written.unflaggedPosts[0]?.['label']).toBe('human');
  });

  it('does NOT overwrite already-labeled entries in --auto mode (idempotent)', async () => {
    const fixture = {
      flaggedPosts: [
        { text: 'AI post', score: 80, label: 'human' }, // already labeled
        { text: 'Unlabeled', score: 70 },                // no label
      ],
      unflaggedPosts: [],
    };
    const p = join(tmp.dir, 'export.json');
    writeFileSync(p, JSON.stringify(fixture), 'utf8');

    process.argv = ['node', 'eval-label.ts', p, '--auto'];
    await expect(main()).rejects.toThrow(`${EXIT}0`);

    const written = JSON.parse(readFileSync(p, 'utf8')) as {
      flaggedPosts: Array<Record<string, unknown>>;
    };
    // Already-labeled entry keeps its original label
    expect(written.flaggedPosts[0]?.['label']).toBe('human');
    // Unlabeled entry is now labeled
    expect(written.flaggedPosts[1]?.['label']).toBe('ai');
  });

  it('preserves all non-label fields on entries after --auto run', async () => {
    const fixture = {
      flaggedPosts: [{ urn: 'urn:99', authorId: 'bob', text: 'Test', score: 65 }],
      unflaggedPosts: [],
    };
    const p = join(tmp.dir, 'export.json');
    writeFileSync(p, JSON.stringify(fixture), 'utf8');

    process.argv = ['node', 'eval-label.ts', p, '--auto'];
    await expect(main()).rejects.toThrow(`${EXIT}0`);

    const written = JSON.parse(readFileSync(p, 'utf8')) as {
      flaggedPosts: Array<Record<string, unknown>>;
    };
    const entry = written.flaggedPosts[0]!;
    expect(entry['urn']).toBe('urn:99');
    expect(entry['authorId']).toBe('bob');
    expect(entry['text']).toBe('Test');
    expect(entry['score']).toBe(65);
    expect(entry['label']).toBe('ai');
  });
});
