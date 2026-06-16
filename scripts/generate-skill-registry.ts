#!/usr/bin/env node
// scripts/generate-skill-registry.ts
// Run with: tsx scripts/generate-skill-registry.ts
// Reads:  scripts/skill-order.json + src/skills/library/**/SKILL.md
// Writes: src/content/generated-skill-registry.ts
//
// Codegen step for the Skill Library Alignment (Phase 31).
// Parses + validates SKILL.md frontmatter for each declared skill folder,
// then emits a committed TypeScript module with static imports and ordered
// skill arrays. No dynamic import, no import.meta.glob, no eval — MV3-CSP safe.

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SkillOrder {
  signals: string[];
  exclusions: string[];
  detectors: string[];
}

interface SkillFrontmatter {
  name: string;
  description: string;
  metadata: { kind: 'signal' | 'exclusion' | 'detector' };
}

interface SkillEntry {
  name: string;
  description: string;
  kind: 'signal' | 'exclusion' | 'detector';
  folder: string;
}

// ---------------------------------------------------------------------------
// Frontmatter validation (D-08)
// ---------------------------------------------------------------------------

function validateFrontmatter(fm: unknown, skillName: string): SkillFrontmatter {
  if (!fm || typeof fm !== 'object') {
    process.stderr.write(`ERROR: ${skillName}: SKILL.md frontmatter is empty or not an object\n`);
    process.exit(1);
  }
  const f = fm as Record<string, unknown>;
  if (typeof f['name'] !== 'string' || !f['name'].trim()) {
    process.stderr.write(`ERROR: ${skillName}: SKILL.md 'name' must be a non-empty string\n`);
    process.exit(1);
  }
  if (typeof f['description'] !== 'string' || !f['description'].trim()) {
    process.stderr.write(`ERROR: ${skillName}: SKILL.md 'description' must be a non-empty string\n`);
    process.exit(1);
  }
  const meta = f['metadata'] as Record<string, unknown> | undefined;
  const kind = meta?.['kind'];
  if (!['signal', 'exclusion', 'detector'].includes(kind as string)) {
    process.stderr.write(
      `ERROR: ${skillName}: SKILL.md metadata.kind must be 'signal' | 'exclusion' | 'detector', got: ${String(kind)}\n`,
    );
    process.exit(1);
  }
  return f as unknown as SkillFrontmatter;
}

// ---------------------------------------------------------------------------
// Parse a single SKILL.md, returning null if the file does not exist.
// TRACER-PHASE-ONLY: non-existent folders are skipped and logged to stderr
// so the codegen does not fail when declared-but-not-yet-migrated skill
// folders are listed in skill-order.json (waves 2-3 will add them).
// ---------------------------------------------------------------------------

function parseSkillMd(folderName: string): SkillEntry | null {
  const skillMdPath = path.join(repoRoot, 'src', 'skills', 'library', folderName, 'SKILL.md');

  if (!fs.existsSync(skillMdPath)) {
    // Skip-and-continue for not-yet-migrated skill folders (tracer-phase-only behavior).
    // This will be removed once all skill folders exist (wave 3+ cleanup).
    process.stderr.write(
      `INFO: Skipping '${folderName}' — SKILL.md not found at ${skillMdPath} (not yet migrated)\n`,
    );
    return null;
  }

  const raw = fs.readFileSync(skillMdPath, 'utf-8');
  // Support both LF and CRLF line endings in SKILL.md files (Windows checkout behaviour)
  const normalised = raw.replace(/\r\n/g, '\n');
  const match = normalised.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    process.stderr.write(`ERROR: ${folderName}: SKILL.md has no valid YAML frontmatter block (expected ---...---)\n`);
    process.exit(1);
  }

  const parsed = yaml.load(match[1]);
  const fm = validateFrontmatter(parsed, folderName);

  return {
    name: fm.name.trim(),
    description: fm.description.trim(),
    kind: fm.metadata.kind,
    folder: folderName,
  };
}

// ---------------------------------------------------------------------------
// Emit helpers
// ---------------------------------------------------------------------------

function importVarName(folder: string, kind: 'signal' | 'exclusion' | 'detector'): string {
  // Convert kebab-case folder names to camelCase variable names,
  // matching the existing codebase naming convention:
  //   signal skills:    <camel>Skill           (e.g., listicleCtaSkill)
  //   exclusion skills: <camel>ExclusionSkill  (e.g., sponsoredExclusionSkill)
  //   detector skills:  <camel>Skill           (e.g., heuristicSkill)
  const camel = folder.replace(/-([a-z])/g, (_, c: string) => (c as string).toUpperCase());
  const suffix = kind === 'exclusion' ? 'ExclusionSkill' : 'Skill';
  return `${camel}${suffix}`;
}

function importPath(folder: string): string {
  return `../skills/library/${folder}/${folder}.skill`;
}

// ---------------------------------------------------------------------------
// Main codegen
// ---------------------------------------------------------------------------

function main(): void {
  // 1. Read the ordered list from config
  const orderPath = path.join(repoRoot, 'scripts', 'skill-order.json');
  const order: SkillOrder = JSON.parse(fs.readFileSync(orderPath, 'utf-8')) as SkillOrder;

  // 2. Parse + validate SKILL.md for each present folder
  const signalEntries: SkillEntry[] = order.signals.map(parseSkillMd).filter((e): e is SkillEntry => e !== null);
  const exclusionEntries: SkillEntry[] = order.exclusions.map(parseSkillMd).filter((e): e is SkillEntry => e !== null);
  const detectorEntries: SkillEntry[] = order.detectors.map(parseSkillMd).filter((e): e is SkillEntry => e !== null);

  // 3. Build the generated module source
  const lines: string[] = [];

  // Header
  lines.push('// src/content/generated-skill-registry.ts');
  lines.push('// ============================================================');
  lines.push('// DO NOT EDIT — generated by scripts/generate-skill-registry.ts');
  lines.push('// Regenerate: npm run generate-skill-registry');
  lines.push('// Stale-check: npm run check-skill-registry');
  lines.push('// ============================================================');
  lines.push('');

  // Type imports
  lines.push("import type { SignalSkill, ExclusionSkill } from '../shared/skills/types';");
  lines.push('');

  // Signal skill imports
  if (signalEntries.length > 0) {
    lines.push('// Signal skill imports (pipeline step-order — DO NOT reorder, golden-score snapshot depends on it D-06)');
    for (const entry of signalEntries) {
      lines.push(`import { ${importVarName(entry.folder, entry.kind)} } from '${importPath(entry.folder)}';`);
    }
    lines.push('');
  }

  // Exclusion skill imports
  if (exclusionEntries.length > 0) {
    lines.push('// Exclusion skill imports (priority order — DO NOT reorder, exclusion parity depends on it D-06)');
    for (const entry of exclusionEntries) {
      lines.push(`import { ${importVarName(entry.folder, entry.kind)} } from '${importPath(entry.folder)}';`);
    }
    lines.push('');
  }

  // Detector skill imports (not consumed by arrays below — detectors are instantiated in index.ts)
  if (detectorEntries.length > 0) {
    lines.push('// Detector skill imports (for completeness — consumed via index.ts, not via arrays below)');
    for (const entry of detectorEntries) {
      lines.push(`// import { ${importVarName(entry.folder, entry.kind)} } from '${importPath(entry.folder)}'; // not yet migrated`);
    }
    lines.push('');
  }

  // GENERATED_SIGNAL_SKILLS array
  lines.push('// Order MUST match CODE_SIGNAL_SKILLS from Phase 30 — golden-score snapshot depends on it (D-06)');
  lines.push('export const GENERATED_SIGNAL_SKILLS: readonly SignalSkill[] = [');
  for (const entry of signalEntries) {
    lines.push(`  ${importVarName(entry.folder, entry.kind)},`);
  }
  lines.push('];');
  lines.push('');

  // GENERATED_EXCLUSION_SKILLS array
  lines.push('// Order MUST match CODE_EXCLUSION_SKILLS from Phase 30 — exclusion parity depends on it (D-06)');
  lines.push('export const GENERATED_EXCLUSION_SKILLS: readonly ExclusionSkill[] = [');
  for (const entry of exclusionEntries) {
    lines.push(`  ${importVarName(entry.folder, entry.kind)},`);
  }
  lines.push('];');
  lines.push('');

  // GENERATED_SKILL_METADATA object (descriptive — for documentation/LLM use, not consumed at runtime)
  const allEntries = [...signalEntries, ...exclusionEntries, ...detectorEntries];
  lines.push('// Descriptive metadata from SKILL.md manifests.');
  lines.push('// NOT consumed by the runtime registry — skill objects carry their own kind/id/etc.');
  lines.push('// Available for documentation and future LLM skill-authoring tooling.');
  lines.push('export const GENERATED_SKILL_METADATA = {');
  for (const entry of allEntries) {
    const escapedDesc = entry.description.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    lines.push(`  '${entry.folder}': { name: '${entry.name}', description: '${escapedDesc}', kind: '${entry.kind}' as const },`);
  }
  lines.push('} as const;');
  lines.push('');

  // 4. Write the generated file
  const outputPath = path.join(repoRoot, 'src', 'content', 'generated-skill-registry.ts');
  const output = lines.join('\n');
  fs.writeFileSync(outputPath, output, 'utf-8');

  process.stdout.write(`Generated: ${outputPath}\n`);
  process.stdout.write(
    `  Signal skills:    ${signalEntries.length} (${signalEntries.map(e => e.folder).join(', ') || 'none'})\n`,
  );
  process.stdout.write(
    `  Exclusion skills: ${exclusionEntries.length} (${exclusionEntries.map(e => e.folder).join(', ') || 'none'})\n`,
  );
  process.stdout.write(
    `  Detector skills:  ${detectorEntries.length} (${detectorEntries.map(e => e.folder).join(', ') || 'none'})\n`,
  );
}

main();
