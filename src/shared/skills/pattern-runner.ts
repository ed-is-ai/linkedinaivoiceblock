/**
 * LinkedIn Blocker — PatternSkillRunner (host-agnostic, MV3-CSP-safe)
 *
 * Executes declarative PatternSkill rules without eval or new Function.
 * Pattern strings are compiled to RegExp via `new RegExp(str)` — the same trust model
 * SelectorRegistry uses for selector strings. No code-execution path is ever introduced;
 * rule fields are treated as DATA, not as executable code (D-02, T-30-01).
 *
 * Invariants:
 *   - NO eval, NO new Function — MV3 Content Security Policy strictly forbids these.
 *   - NO chrome.* APIs — this module is host-agnostic (usable in content script, CLI, tests).
 *   - NO DOM access — postText is a plain string passed via SignalContext.
 *   - Regex patterns are compiled ONCE at first use, cached in a module-scope Map keyed by
 *     skill.id (mirrors buzzwords.ts compile-once pattern, RESEARCH §Don't Hand-Roll).
 *   - This runner is supported-but-unused at Plan 02 launch (zero declarative skills seeded).
 *     It exists to prove the declarative flavor is expressible and MV3-CSP-safe.
 */

import type { PatternSkill, SignalContext } from './types';
import { detectionConfig } from '../detectionConfig';

// ---------------------------------------------------------------------------
// Compiled RegExp cache — keyed by skill.id; built once, reused per post
// ---------------------------------------------------------------------------

const _compiledPatterns = new Map<string, RegExp[]>();

/**
 * Invalidate the compiled-regex cache (WR-02).
 *
 * The cache assumes skill.id → patterns is immutable for the process lifetime.
 * The registry's write path (addDeclarativeSkill) and cross-tab onChanged refresh
 * can replace a skill with the same id but different rule.patterns, which would
 * otherwise return stale compiled regexes. The registry calls this on every write.
 *
 * @param id - When provided, clears only that skill's entry; otherwise clears all.
 */
export function clearCompiledCache(id?: string): void {
  if (id === undefined) {
    _compiledPatterns.clear();
    return;
  }
  _compiledPatterns.delete(id);
}

// ---------------------------------------------------------------------------
// Dotted-path resolver into detectionConfig.weights
// ---------------------------------------------------------------------------

/**
 * Resolves a dot-separated key path (e.g. 'emDash.max') into detectionConfig.weights.
 * Returns the numeric value if found, or 0 if the path is unknown (fail-closed: T-30-03).
 * An unknown weightKey awards zero points — no untrusted key can escalate a score.
 */
function resolveWeight(weightKey: string): number {
  const parts = weightKey.split('.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let node: any = detectionConfig.weights;
  for (const part of parts) {
    if (node === null || typeof node !== 'object' || !(part in node)) {
      return 0; // fail-closed: unknown path awards no points (T-30-03)
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    node = node[part];
  }
  return typeof node === 'number' ? node : 0;
}

// ---------------------------------------------------------------------------
// Numeric extractors — named functions referenced by 'numeric-threshold' rules
// ---------------------------------------------------------------------------

/** Computes em-dash density: (count of '—' / word count) * 100 */
function extractEmDashDensity(postText: string): number {
  const words = postText.trim().split(/\s+/).length;
  if (words === 0) return 0;
  const emDashes = (postText.match(/—/g) ?? []).length;
  return (emDashes / words) * 100;
}

/** Computes word count from postText */
function extractWordCount(postText: string): number {
  return postText.trim().split(/\s+/).length;
}

// ---------------------------------------------------------------------------
// Main runner
// ---------------------------------------------------------------------------

/**
 * Executes a PatternSkill against a SignalContext without eval or new Function.
 * Returns the resolved numeric score contribution (0 = no signal).
 *
 * Supports three rule kinds:
 *   - keyword-set  : match keywords (any-match or density threshold)
 *   - regex        : compile patterns from strings via new RegExp (cached per skill.id)
 *   - numeric-threshold : named extractor + comparison operator
 */
export function runPatternSkill(skill: PatternSkill, ctx: SignalContext): number {
  const { rule } = skill;
  const text = ctx.postData.postText;

  if (rule.kind === 'keyword-set') {
    const lowerText = text.toLowerCase();

    if (rule.matchMode === 'any') {
      const hit = rule.keywords.some(kw => lowerText.includes(kw.toLowerCase()));
      return hit ? resolveWeight(skill.weightKey) : 0;
    }

    // matchMode === 'density'
    const words = text.trim().split(/\s+/).length;
    if (words === 0) return 0;
    const hits = rule.keywords.filter(kw => lowerText.includes(kw.toLowerCase())).length;
    const density = (hits / words) * 100;
    const threshold = rule.densityThreshold ?? 1;
    return density >= threshold ? resolveWeight(skill.weightKey) : 0;
  }

  if (rule.kind === 'regex') {
    // Compile patterns once per skill.id — reuse on subsequent calls
    let compiled = _compiledPatterns.get(skill.id);
    if (!compiled) {
      compiled = rule.patterns.map(p => new RegExp(p, 'gi'));
      _compiledPatterns.set(skill.id, compiled);
    }

    // Reset lastIndex before each test (global regexes are stateful)
    const hits = compiled.filter(re => {
      re.lastIndex = 0;
      return re.test(text);
    }).length;

    return hits >= rule.minHits ? resolveWeight(skill.weightKey) : 0;
  }

  if (rule.kind === 'numeric-threshold') {
    let extracted: number;
    if (rule.extractFn === 'em-dash-density') {
      extracted = extractEmDashDensity(text);
    } else {
      // 'word-count'
      extracted = extractWordCount(text);
    }

    if (rule.operator === '>') {
      return extracted > rule.value ? resolveWeight(skill.weightKey) : 0;
    }

    return 0;
  }

  return 0;
}
