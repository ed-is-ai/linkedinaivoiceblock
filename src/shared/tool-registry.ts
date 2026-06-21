/**
 * LinkedIn Blocker — Tool Registry Singleton (Phase 32 — TOOL-01)
 *
 * Synchronous, code-seeded registry for first-class Tool<I, O> objects.
 * Mirrors the code-seed pattern of SkillRegistry but intentionally simpler:
 *   - No chrome.storage hydration (D-05 — tools are code-seeded only)
 *   - No migrate(), no seedIfNeeded(), no onChanged listener
 *   - No async lifecycle — the Map is built synchronously at module init
 *
 * RESEARCH Pitfall 2: _registry Map construction MUST be synchronous — no
 * chrome.* calls at module init. Tests run without chrome globals present.
 *
 * Usage:
 *   import { get } from './tool-registry';
 *   const tool = get<Input, Output>('dom-selector-rederive');
 *   const result = await tool.execute(input);
 *
 * To add a tool:
 *   1. Create src/tools/library/<name>/ with TOOL.md (kind: tool) + <name>.tool.ts
 *   2. Add folder name to skill-order.json "tools" array
 *   3. Run npm run generate-skill-registry
 *   4. Run npm test && npm run check-tool-registry
 */

// Static import from the committed generated registry module.
// DO NOT import tool modules directly here — tool-registry.ts is not the
// registration point. To add a tool: drop a tools/library/<name>/ folder
// + rerun `npm run generate-skill-registry`.
// (No dynamic import, no import.meta.glob — MV3-CSP-safe, D-07)
import { GENERATED_TOOLS } from './generated-tool-registry';
import type { Tool } from './skills/types';

// ---------------------------------------------------------------------------
// Module-level registry — synchronous Map built from code-seeded GENERATED_TOOLS
// No chrome.* access here (RESEARCH Pitfall 2)
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _registry: Map<string, Tool<any, any>> = new Map(
  GENERATED_TOOLS.map(t => [t.name, t]),
);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Synchronously retrieve a registered tool by name.
 *
 * @throws {Error} with message containing "Unknown tool" if name is not registered.
 *
 * @example
 *   const tool = get<{ target: string; domSkeleton: string }, { candidates: RederiveCandidate[]; usage: AnthropicUsage | undefined }>('dom-selector-rederive');
 *   const result = await tool.execute({ target, domSkeleton });
 */
export function get<I, O>(name: string): Tool<I, O> {
  const tool = _registry.get(name);
  if (!tool) throw new Error(`[ToolRegistry] Unknown tool: '${name}'`);
  return tool as Tool<I, O>;
}
