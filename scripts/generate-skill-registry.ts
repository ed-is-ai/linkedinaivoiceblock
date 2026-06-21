#!/usr/bin/env node
// scripts/generate-skill-registry.ts
// Run with: tsx scripts/generate-skill-registry.ts
// Reads:  scripts/skill-order.json + src/skills/library/**/SKILL.md (skills) + src/tools/library/**/TOOL.md (tools)
// Writes: src/content/generated-skill-registry.ts + src/shared/generated-tool-registry.ts
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
  // Phase 32: tools bucket (D-05)
  tools?: string[];
}

interface SkillFrontmatter {
  name: string;
  description: string;
  metadata: { kind: 'signal' | 'exclusion' | 'detector' | 'tool' };
}

interface SkillEntry {
  name: string;
  description: string;
  kind: 'signal' | 'exclusion' | 'detector' | 'tool';
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
  if (!['signal', 'exclusion', 'detector', 'tool'].includes(kind as string)) {
    process.stderr.write(
      `ERROR: ${skillName}: SKILL.md metadata.kind must be 'signal' | 'exclusion' | 'detector' | 'tool', got: ${String(kind)}\n`,
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

// Skills live under src/skills/library/; tools live under src/tools/library/.
// The base dir is selected per bucket in main() so each kind reads from the
// correct location.
// Skills declare their manifest in SKILL.md; tools declare theirs in TOOL.md.
function parseSkillMd(
  folderName: string,
  baseDir: string[] = ['src', 'skills', 'library'],
  manifest = 'SKILL.md',
): SkillEntry | null {
  const skillMdPath = path.join(repoRoot, ...baseDir, folderName, manifest);

  if (!fs.existsSync(skillMdPath)) {
    // Skip-and-continue for not-yet-migrated skill folders (tracer-phase-only behavior).
    // This will be removed once all skill folders exist (wave 3+ cleanup).
    process.stderr.write(
      `INFO: Skipping '${folderName}' — ${manifest} not found at ${skillMdPath} (not yet migrated)\n`,
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

/** Last path segment of a (possibly nested) skill-order entry, e.g.
 *  'detect-aiwriting-heuristic/signals/detect-ai-vocab' → 'detect-ai-vocab'. */
function leafName(folder: string): string {
  return folder.split('/').pop() ?? folder;
}

function importVarName(folderPath: string, kind: 'signal' | 'exclusion' | 'detector' | 'tool'): string {
  const folder = leafName(folderPath); // derive the var from the leaf folder, not the nested path
  if (kind === 'tool') {
    // Full folder name camelCased (no prefix strip) + Tool suffix (RESEARCH §ToolRegistry Design)
    // e.g. dom-selector-rederive → domSelectorRederiveTool
    const camel = folder.replace(/-([a-z])/g, (_, c: string) => (c as string).toUpperCase());
    return `${camel}Tool`;
  }
  // Convert kebab-case folder names to camelCase variable names,
  // matching the existing codebase naming convention:
  //   signal skills:    <camel>Skill           (e.g., listicleCtaSkill)
  //   exclusion skills: <camel>ExclusionSkill  (e.g., sponsoredExclusionSkill)
  //   detector skills:  <camel>Skill           (e.g., heuristicSkill)
  //
  // Folder names carry a type prefix (detect-/exclude-/dom-selector-) so the skill
  // kind is visible in the file tree without opening SKILL.md, but the exported
  // const names are NOT prefixed. Strip the type prefix before camelCasing so the
  // generated import binds to the real export (e.g. folder `exclude-sponsored`
  // imports `sponsoredExclusionSkill`, not `excludeSponsoredExclusionSkill`).
  const base = folder.replace(/^(detect|exclude|dom-selector)-/, '');
  const camel = base.replace(/-([a-z])/g, (_, c: string) => (c as string).toUpperCase());
  const suffix = kind === 'exclusion' ? 'ExclusionSkill' : 'Skill';
  return `${camel}${suffix}`;
}

function importPath(folder: string, kind: 'signal' | 'exclusion' | 'detector' | 'tool'): string {
  // Directory uses the full (possibly nested) entry; the file basename uses the leaf folder.
  const leaf = leafName(folder);
  if (kind === 'tool') {
    // Relative from src/shared/ (generated-tool-registry.ts lives there); tools live under src/tools/library/
    return `../tools/library/${folder}/${leaf}.tool`;
  }
  // Relative from src/content/ (generated-skill-registry.ts lives there)
  return `../skills/library/${folder}/${leaf}.skill`;
}

// ---------------------------------------------------------------------------
// Main codegen
// ---------------------------------------------------------------------------

function main(): void {
  // 1. Read the ordered list from config
  const orderPath = path.join(repoRoot, 'scripts', 'skill-order.json');
  const order: SkillOrder = JSON.parse(fs.readFileSync(orderPath, 'utf-8')) as SkillOrder;

  // 2. Parse + validate SKILL.md for each present folder
  const signalEntries: SkillEntry[] = order.signals.map(f => parseSkillMd(f)).filter((e): e is SkillEntry => e !== null);
  const exclusionEntries: SkillEntry[] = order.exclusions.map(f => parseSkillMd(f)).filter((e): e is SkillEntry => e !== null);
  const detectorEntries: SkillEntry[] = order.detectors.map(f => parseSkillMd(f)).filter((e): e is SkillEntry => e !== null);
  // Phase 32: tools bucket (D-05). Tools live under src/tools/library/ and declare TOOL.md.
  const toolEntries: SkillEntry[] = (order.tools ?? [])
    .map(folder => parseSkillMd(folder, ['src', 'tools', 'library'], 'TOOL.md'))
    .filter((e): e is SkillEntry => e !== null);

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
      lines.push(`import { ${importVarName(entry.folder, entry.kind)} } from '${importPath(entry.folder, entry.kind)}';`);
    }
    lines.push('');
  }

  // Exclusion skill imports
  if (exclusionEntries.length > 0) {
    lines.push('// Exclusion skill imports (priority order — DO NOT reorder, exclusion parity depends on it D-06)');
    for (const entry of exclusionEntries) {
      lines.push(`import { ${importVarName(entry.folder, entry.kind)} } from '${importPath(entry.folder, entry.kind)}';`);
    }
    lines.push('');
  }

  // Detector skills are NOT imported here — detectors are instantiated in index.ts/eval.ts
  // directly and are NOT consumed via registry arrays. Metadata only (Open Question 2 resolution).

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

  // GENERATED_DETECTOR_SKILLS metadata (descriptive only — detectors are NOT in registry arrays)
  // Detectors are instantiated directly in index.ts/eval.ts; this export exists for completeness (Open Question 2).
  if (detectorEntries.length > 0) {
    lines.push('// Detector skill metadata (descriptive only — detectors are instantiated in index.ts/eval.ts,');
    lines.push('// NOT consumed via this registry. This export satisfies D-02 completeness only.)');
    lines.push('export const GENERATED_DETECTOR_SKILLS = {');
    for (const entry of detectorEntries) {
      const escapedDesc = entry.description.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      lines.push(`  '${leafName(entry.folder)}': { name: '${entry.name}', description: '${escapedDesc}', kind: '${entry.kind}' as const },`);
    }
    lines.push('} as const;');
    lines.push('');
  }

  // GENERATED_SKILL_METADATA object (descriptive — for documentation/LLM use, not consumed at runtime)
  const allEntries = [...signalEntries, ...exclusionEntries, ...detectorEntries];
  lines.push('// Descriptive metadata from SKILL.md manifests.');
  lines.push('// NOT consumed by the runtime registry — skill objects carry their own kind/id/etc.');
  lines.push('// Available for documentation and future LLM skill-authoring tooling.');
  lines.push('export const GENERATED_SKILL_METADATA = {');
  for (const entry of allEntries) {
    const escapedDesc = entry.description.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    lines.push(`  '${leafName(entry.folder)}': { name: '${entry.name}', description: '${escapedDesc}', kind: '${entry.kind}' as const },`);
  }
  lines.push('} as const;');
  lines.push('');

  // 4. Write the generated skill file
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

  // 5. Build and write the generated tool registry (src/shared/ — separate from src/content/)
  // CRITICAL (RESEARCH Pitfall 1): this is a SEPARATE toolLines array and a SEPARATE writeFileSync.
  // The existing lines array and skill outputPath above are NOT altered.
  const toolLines: string[] = [];

  // Header
  toolLines.push('// src/shared/generated-tool-registry.ts');
  toolLines.push('// ============================================================');
  toolLines.push('// DO NOT EDIT — generated by scripts/generate-skill-registry.ts');
  toolLines.push('// Regenerate: npm run generate-skill-registry');
  toolLines.push('// Stale-check: npm run check-tool-registry');
  toolLines.push('// ============================================================');
  toolLines.push('');

  // Type import
  toolLines.push("import type { Tool } from './skills/types';");
  toolLines.push('');

  // Static tool imports (no dynamic import, no import.meta.glob — MV3-CSP-safe, D-07)
  if (toolEntries.length > 0) {
    for (const entry of toolEntries) {
      toolLines.push(`import { ${importVarName(entry.folder, entry.kind)} } from '${importPath(entry.folder, entry.kind)}';`);
    }
    toolLines.push('');
  }

  // GENERATED_TOOLS array
  toolLines.push('export const GENERATED_TOOLS: readonly Tool<unknown, unknown>[] = [');
  for (const entry of toolEntries) {
    toolLines.push(`  ${importVarName(entry.folder, entry.kind)},`);
  }
  toolLines.push('];');
  toolLines.push('');

  // GENERATED_TOOL_METADATA object (descriptive — for documentation/LLM use)
  toolLines.push('export const GENERATED_TOOL_METADATA = {');
  for (const entry of toolEntries) {
    const escapedDesc = entry.description.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    toolLines.push(`  '${leafName(entry.folder)}': { name: '${entry.name}', description: '${escapedDesc}', kind: 'tool' as const },`);
  }
  toolLines.push('} as const;');
  toolLines.push('');

  const toolOutputPath = path.join(repoRoot, 'src', 'shared', 'generated-tool-registry.ts');
  fs.writeFileSync(toolOutputPath, toolLines.join('\n'), 'utf-8');

  process.stdout.write(`Generated: ${toolOutputPath}\n`);
  process.stdout.write(
    `  Tools:            ${toolEntries.length} (${toolEntries.map(e => e.folder).join(', ') || 'none'})\n`,
  );
}

main();
