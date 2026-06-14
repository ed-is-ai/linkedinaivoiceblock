#!/usr/bin/env node
// Reads an Export JSON and interactively labels each unlabeled post entry.
// Writes labels back into the export in-place (flaggedPosts[i].label / unflaggedPosts[i].label).
// Run via: npm run eval-label -- <export.json>  [--auto]
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import readline from 'readline';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LabelValue = 'ai' | 'human';

interface ExportData {
  flaggedPosts: unknown[];
  unflaggedPosts: unknown[];
  [k: string]: unknown;
}

// ---------------------------------------------------------------------------
// Pure helper — exported for unit tests (T-27-04: only adds/updates label key)
// ---------------------------------------------------------------------------

/**
 * Sets data[arrayKey][index].label = label, preserving all other fields.
 * Never reconstructs the entry object — only mutates the `label` key.
 */
export function applyLabel(
  data: { flaggedPosts: unknown[]; unflaggedPosts: unknown[] },
  arrayKey: 'flaggedPosts' | 'unflaggedPosts',
  index: number,
  label: LabelValue,
): void {
  const entry = data[arrayKey][index];
  if (entry !== null && typeof entry === 'object') {
    (entry as Record<string, unknown>)['label'] = label;
  }
}

// ---------------------------------------------------------------------------
// CLI entry guard (isMain pattern from eval.ts)
// ---------------------------------------------------------------------------

const isMain =
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith('eval-label.ts') || process.argv[1].endsWith('eval-label.js'));

if (isMain) {
  await main();
}

// ---------------------------------------------------------------------------
// main()
// ---------------------------------------------------------------------------

export async function main(): Promise<void> {
  // Argv guard — first positional arg is the file path (T-27-05)
  const filePath = process.argv[2];
  if (!filePath) {
    process.stderr.write('Usage: npm run eval-label -- <export.json> [--auto]\n');
    process.exit(1);
  }

  // File read + JSON parse + shape guard (T-27-05: reject malformed input before any mutation)
  let data: ExportData;
  try {
    const raw = readFileSync(resolve(filePath), 'utf8');
    const json = JSON.parse(raw);
    if (typeof json !== 'object' || json === null || Array.isArray(json)) {
      process.stderr.write(`Error: Could not read or parse file: ${filePath}\n`);
      process.exit(1);
    }
    const obj = json as Record<string, unknown>;
    if (!Array.isArray(obj['flaggedPosts']) || !Array.isArray(obj['unflaggedPosts'])) {
      process.stderr.write(
        'Error: JSON must contain "flaggedPosts" and "unflaggedPosts" arrays.\n',
      );
      process.exit(1);
    }
    data = obj as ExportData;
  } catch {
    process.stderr.write(`Error: Could not read or parse file: ${filePath}\n`);
    process.exit(1);
  }

  // --auto bulk-label mode (idempotent: skip entries that already have a label)
  const autoMode = process.argv.includes('--auto');
  if (autoMode) {
    let count = 0;
    for (const entry of data.flaggedPosts) {
      if (entry !== null && typeof entry === 'object' && !('label' in (entry as object))) {
        (entry as Record<string, unknown>)['label'] = 'ai';
        count++;
      }
    }
    for (const entry of data.unflaggedPosts) {
      if (entry !== null && typeof entry === 'object' && !('label' in (entry as object))) {
        (entry as Record<string, unknown>)['label'] = 'human';
        count++;
      }
    }
    // T-27-04: always serialize the full parsed object — never partial string surgery
    writeFileSync(resolve(filePath), JSON.stringify(data, null, 2), 'utf8');
    process.stdout.write(`Auto-labeled ${count} entries. Written to: ${filePath}\n`);
    process.exit(0);
  }

  // Interactive mode — TTY guard (T-27-06: assumption A2)
  if (!process.stdin.isTTY) {
    process.stderr.write(
      'Error: eval-label requires an interactive terminal (TTY). Use --auto for non-interactive use.\n',
    );
    process.exit(1);
  }

  // Interactive keypress reader (Node built-in readline, no new packages)
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');

  async function readKey(): Promise<string> {
    return new Promise((resolveKey) => {
      process.stdin.once('data', (key: string) => resolveKey(key));
    });
  }

  let labeled = 0;
  let skipped = 0;

  // Iterate flaggedPosts then unflaggedPosts
  const allEntries: Array<{
    arrayKey: 'flaggedPosts' | 'unflaggedPosts';
    index: number;
    entry: Record<string, unknown>;
    defaultLabel: LabelValue;
  }> = [];

  for (let i = 0; i < data.flaggedPosts.length; i++) {
    const e = data.flaggedPosts[i];
    if (e !== null && typeof e === 'object' && !('label' in (e as object))) {
      allEntries.push({
        arrayKey: 'flaggedPosts',
        index: i,
        entry: e as Record<string, unknown>,
        defaultLabel: 'ai',
      });
    }
  }
  for (let i = 0; i < data.unflaggedPosts.length; i++) {
    const e = data.unflaggedPosts[i];
    if (e !== null && typeof e === 'object' && !('label' in (e as object))) {
      allEntries.push({
        arrayKey: 'unflaggedPosts',
        index: i,
        entry: e as Record<string, unknown>,
        defaultLabel: 'human',
      });
    }
  }

  process.stdout.write(
    `\neval-label: ${allEntries.length} unlabeled entries to review.\n` +
      `Keys: [a] ai  [h] human  [s] skip  [q] quit\n\n`,
  );

  for (const { arrayKey, index, entry } of allEntries) {
    const text = typeof entry['text'] === 'string' ? entry['text'] : '';
    const textPreview = text.slice(0, 120);
    const score = typeof entry['score'] === 'number' ? entry['score'] : '?';

    process.stdout.write(`[${arrayKey}[${index}]] score=${score}\n`);
    process.stdout.write(`  "${textPreview}"\n`);
    process.stdout.write(`  [a] ai  [h] human  [s] skip  [q] quit > `);

    const key = await readKey();

    if (key === 'q' || key === '') {
      // q or Ctrl-C
      process.stdout.write('\nQuit.\n');
      break;
    } else if (key === 'a') {
      applyLabel(data, arrayKey, index, 'ai');
      writeFileSync(resolve(filePath), JSON.stringify(data, null, 2), 'utf8');
      process.stdout.write(' → ai\n');
      labeled++;
    } else if (key === 'h') {
      applyLabel(data, arrayKey, index, 'human');
      writeFileSync(resolve(filePath), JSON.stringify(data, null, 2), 'utf8');
      process.stdout.write(' → human\n');
      labeled++;
    } else {
      process.stdout.write(' → skipped\n');
      skipped++;
    }
  }

  process.stdin.setRawMode(false);
  process.stdin.pause();

  // Use readline.clearLine to avoid directly importing readline types
  void readline;

  process.stdout.write(`\nDone. Labeled: ${labeled}  Skipped: ${skipped}\n`);
}
