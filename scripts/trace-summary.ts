#!/usr/bin/env node
// Reads a linkedin-blocker-traces-YYYY-MM-DD.json export, prints a per-source/model
// cost breakdown table to stdout, and writes/updates ## LLM Cost Reference in README.md.
// Run via: npm run trace-summary <file>
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { computeCostUsd } from '../src/shared/llm/pricing.js';
import type { TraceEntry } from '../src/shared/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const README_PATH = join(__dirname, '../README.md');
const SECTION_HEADING = '## LLM Cost Reference';

// ---------------------------------------------------------------------------
// Validation (D-07)
// ---------------------------------------------------------------------------

const filePath = process.argv[2];
if (!filePath) {
  process.stderr.write('Usage: npm run trace-summary <traces-export.json>\n');
  process.exit(1);
}

let parsed: { exportedAt: string; traces: TraceEntry[] };
try {
  const raw = readFileSync(resolve(filePath), 'utf8');
  parsed = JSON.parse(raw) as { exportedAt: string; traces: TraceEntry[] };
} catch {
  process.stderr.write(`Error: Could not read or parse file: ${filePath}\n`);
  process.exit(1);
}

if (!Array.isArray(parsed.traces)) {
  process.stderr.write('Error: JSON does not contain a "traces" array.\n');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Cost recompute + aggregation (D-01/D-01a, D-03, D-05)
// ---------------------------------------------------------------------------

interface GroupStats {
  source: string;
  model: string;
  calls: number;       // successful call count
  failed: number;      // failed call count (error field present)
  inputTokens: number;
  outputTokens: number;
  totalUsd: number;
}

const groups = new Map<string, GroupStats>();

for (const rawEntry of parsed.traces) {
  // Guard against null / non-object elements in untrusted input (CR-01).
  // parsed.traces is cast from JSON.parse, so elements may be null/primitives at runtime.
  if (rawEntry === null || typeof rawEntry !== 'object') {
    process.stderr.write(`Warning: skipping non-object trace entry: ${JSON.stringify(rawEntry as unknown)}\n`);
    continue;
  }

  // rawEntry is declared TraceEntry, but the JSON is untrusted — after the
  // object guard above it is safe to treat as a (possibly partial) TraceEntry.
  const entry = rawEntry;

  const key = `${entry.source}\0${entry.model}`;
  if (!groups.has(key)) {
    groups.set(key, {
      source: entry.source,
      model: entry.model,
      calls: 0,
      failed: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalUsd: 0,
    });
  }
  const g = groups.get(key)!;

  if (entry.error) {
    // Failed call — track separately, exclude from token/USD columns
    g.failed += 1;
  } else {
    // Coerce untrusted numeric fields — non-finite values must not propagate
    // NaN into the table / README (WR-01).
    const safe = (n: number): number => (Number.isFinite(n) ? n : 0);
    const inputTokens = safe(entry.inputTokens);
    const outputTokens = safe(entry.outputTokens);

    // Successful call — recompute cost via shared module (D-01/D-01a)
    const usage = {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cache_creation_input_tokens: safe(entry.cacheCreationTokens),
      cache_read_input_tokens: safe(entry.cacheReadTokens),
    };
    const { costUsd } = computeCostUsd(entry.model, usage);

    g.calls += 1;
    g.inputTokens += inputTokens;
    g.outputTokens += outputTokens;
    g.totalUsd += safe(costUsd);
  }
}

// ---------------------------------------------------------------------------
// Table builder (D-05)
// ---------------------------------------------------------------------------

function fmtUsd(n: number): string {
  return `$${n.toFixed(6)}`;
}

function buildTable(rows: GroupStats[]): string {
  // Totals row
  const totals: GroupStats = {
    source: '**Total**',
    model: '',
    calls: 0,
    failed: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalUsd: 0,
  };
  for (const r of rows) {
    totals.calls += r.calls;
    totals.failed += r.failed;
    totals.inputTokens += r.inputTokens;
    totals.outputTokens += r.outputTokens;
    totals.totalUsd += r.totalUsd;
  }

  const header =
    '| source | model | calls | failed | input tokens | output tokens | total USD | avg USD/call |';
  const separator =
    '|--------|-------|------:|-------:|-------------:|--------------:|----------:|-------------:|';

  const formatRow = (r: GroupStats): string => {
    const avg = r.calls > 0 ? r.totalUsd / r.calls : 0;
    return `| ${r.source} | ${r.model} | ${r.calls} | ${r.failed} | ${r.inputTokens.toLocaleString('en-US')} | ${r.outputTokens.toLocaleString('en-US')} | ${fmtUsd(r.totalUsd)} | ${fmtUsd(avg)} |`;
  };

  const totalsAvg = totals.calls > 0 ? totals.totalUsd / totals.calls : 0;
  const totalsRow = `| **Total** | | ${totals.calls} | ${totals.failed} | ${totals.inputTokens.toLocaleString('en-US')} | ${totals.outputTokens.toLocaleString('en-US')} | ${fmtUsd(totals.totalUsd)} | ${fmtUsd(totalsAvg)} |`;

  if (rows.length === 0) {
    return [header, separator, '| (no traces) | | 0 | 0 | 0 | 0 | $0.000000 | $0.000000 |'].join('\n');
  }

  return [header, separator, ...rows.map(formatRow), totalsRow].join('\n');
}

const groupRows = Array.from(groups.values());
const table = buildTable(groupRows);

// ---------------------------------------------------------------------------
// Stdout output
// ---------------------------------------------------------------------------

process.stdout.write(table + '\n');

// ---------------------------------------------------------------------------
// README upsert (D-06, T-25-04)
// ---------------------------------------------------------------------------

function upsertReadmeSection(
  sectionTable: string,
  date: string,
  successCount: number,
  failCount: number,
): void {
  const generated = `_Generated by \`npm run trace-summary\` on ${date} from ${successCount} successful + ${failCount} failed traces._`;
  const newSection = `${SECTION_HEADING}\n\n${sectionTable}\n\n${generated}\n`;

  if (!existsSync(README_PATH)) {
    writeFileSync(
      README_PATH,
      `# LinkedIn Blocker\n\nA Chrome extension that hides AI-generated posts on LinkedIn.\n\n${newSection}`,
      'utf8',
    );
    return;
  }

  let content = readFileSync(README_PATH, 'utf8');
  const sectionStart = content.indexOf(SECTION_HEADING);

  if (sectionStart === -1) {
    // Append section to end of file (never clobber existing content)
    content = content.trimEnd() + '\n\n' + newSection;
  } else {
    // Replace ONLY from heading to the next ## heading or EOF (T-25-04)
    const afterHeading = content.indexOf('\n## ', sectionStart + 1);
    const end = afterHeading === -1 ? content.length : afterHeading;
    content =
      content.slice(0, sectionStart) +
      newSection +
      (afterHeading === -1 ? '' : '\n' + content.slice(end + 1));
  }

  writeFileSync(README_PATH, content, 'utf8');
}

const today = new Date().toISOString().slice(0, 10);
const successCount = groupRows.reduce((sum, r) => sum + r.calls, 0);
const failCount = groupRows.reduce((sum, r) => sum + r.failed, 0);

upsertReadmeSection(table, today, successCount, failCount);
