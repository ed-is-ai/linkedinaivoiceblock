/**
 * LinkedIn Blocker — Skill Registry Singleton
 *
 * Mirrors SelectorRegistry (src/content/selector-registry.ts) exactly.
 * Runtime source of truth for all skill lookups. Maintains an in-memory cache
 * of the SkillRegistrySchema for sync getter calls, backed by chrome.storage.local
 * for persistence across tabs.
 *
 * Single-writer invariant (CLAUDE.md constraint #1): ONLY this module writes
 * the 'skillRegistry' storage key. No other file may call storageSet({ skillRegistry }).
 *
 * Code skills are NEVER written to storage — they are statically imported and
 * merged at runtime (D-06). Only declarative (PatternSkill) skills live in storage.
 * This makes the storage payload safer than SelectorRegistry because skill defs carry
 * declarative data only (no run()), executed by the eval-free pattern-runner.
 *
 * Zero declarative skills seeded at launch → getSignalSkills() / getExclusionSkills()
 * return exactly the code seeds → zero behavior change (D-06).
 *
 * Supports:
 * - Sync getSignalSkills() / getExclusionSkills() for the runner (reads in-memory _cache
 *   with code-seed fallback when cache is null — pre-load safe)
 * - Async seedIfNeeded() to initialize storage on first load or version bump
 * - Async load() to warm the in-memory cache before the runner starts
 * - Async addDeclarativeSkill() to persist a new PatternSkill (single-writer)
 * - chrome.storage.onChanged listener to refresh cache when other tabs write
 */

import type {
  SkillRegistrySchema,
  SignalSkill,
  ExclusionSkill,
  PatternSkill,
} from '../shared/skills/types';
import { SKILL_REGISTRY_VERSION } from '../shared/skills/types';
import { storageGet, storageSet } from '../shared/storage';
import { clearCompiledCache } from '../shared/skills/pattern-runner';

// ---------------------------------------------------------------------------
// Static imports of all built-in CodeSkill modules (D-07 — no dynamic import,
// no import.meta.glob; MV3-CSP-safe and tree-shakeable)
// ---------------------------------------------------------------------------

// Signal skills — imported in EXACT pipeline step-order (Landmine 2)
import { listicleCtaSkill } from './detector/signals/listicle-cta.skill';
import { buzzwordSkill } from './detector/signals/buzzword.skill';
import { emDashSkill } from './detector/signals/em-dash.skill';
import { aiVocabSkill } from './detector/signals/ai-vocab.skill';
import { hookStorySkill } from './detector/signals/hook-story.skill';
import { motivationalSkill } from './detector/signals/motivational.skill';
import { impersonalSkill } from './detector/signals/impersonal.skill';
import { genericCommentsSkill } from './detector/signals/generic-comments.skill';

// Exclusion skills — sponsored resolves via the generated module (Phase 31 tracer);
// remaining three exclusion skills still imported directly until wave 2 migrates them.
// sponsored MUST appear exactly once — only via GENERATED_EXCLUSION_SKILLS (Pitfall 6).
import { GENERATED_EXCLUSION_SKILLS } from './generated-skill-registry';
import { companyPageExclusionSkill } from './exclusions/company-page.skill';
import { nonEnglishExclusionSkill } from './exclusions/non-english.skill';
import { openToWorkExclusionSkill } from './exclusions/open-to-work.skill';

// ---------------------------------------------------------------------------
// Module-scope state
// ---------------------------------------------------------------------------

/**
 * In-memory cache of the skill registry. Null until load() completes.
 * Refreshed via chrome.storage.onChanged when other tabs write.
 */
let _cache: SkillRegistrySchema | null = null;

/**
 * Ordered array of code-defined signal skills.
 * Insertion order === pipeline step-order === signalBreakdown key order (Landmine 2).
 * DO NOT reorder — the golden-score snapshot pins this exact order.
 */
const CODE_SIGNAL_SKILLS: SignalSkill[] = [
  listicleCtaSkill,
  buzzwordSkill,
  emDashSkill,
  aiVocabSkill,
  hookStorySkill,
  motivationalSkill,
  impersonalSkill,
  genericCommentsSkill,
];

/**
 * Ordered array of code-defined exclusion skills.
 * Priority order matches checkExclusions() — sponsored → company-page → non-english → open-to-work.
 *
 * Wave-1 tracer: sponsored resolves via GENERATED_EXCLUSION_SKILLS (Phase 31 skill-library path).
 * company-page / non-english / open-to-work still imported directly until wave 2 migrates them.
 * sponsored MUST appear exactly once — sourced only via the generated array (Pitfall 6).
 */
const CODE_EXCLUSION_SKILLS: ExclusionSkill[] = [
  ...GENERATED_EXCLUSION_SKILLS,
  companyPageExclusionSkill,
  nonEnglishExclusionSkill,
  openToWorkExclusionSkill,
];

// ---------------------------------------------------------------------------
// Seed registry builder
// ---------------------------------------------------------------------------

/**
 * Build a seed registry with zero declarative skills (D-06).
 * Used during seedIfNeeded() first-write and as the fallback for malformed storage.
 */
function buildSeedRegistry(): SkillRegistrySchema {
  return {
    version: SKILL_REGISTRY_VERSION,
    declarativeSignalSkills: [],
    declarativeExclusionSkills: [],
    lastModifiedAt: null,
  };
}

/**
 * Additive migration (WR-03) — mirrors SelectorRegistry.migrate().
 *
 * On a version mismatch the previous implementation reset storage to an empty seed,
 * destroying LLM-authored / user-accumulated declarative skills (the phase's whole
 * premise) on the first SKILL_REGISTRY_VERSION bump. This preserves existing
 * declarative skills and only updates the version, so a version bump never silently
 * discards user data. Storage that is absent or structurally malformed still falls
 * back to a clean seed.
 */
function migrate(stored: SkillRegistrySchema | undefined): SkillRegistrySchema {
  if (
    !stored ||
    typeof stored !== 'object' ||
    !Array.isArray(stored.declarativeSignalSkills) ||
    !Array.isArray(stored.declarativeExclusionSkills)
  ) {
    return buildSeedRegistry();
  }

  return {
    version: SKILL_REGISTRY_VERSION,
    // Preserve user/LLM-authored skills across the version bump (additive, not destructive).
    declarativeSignalSkills: [...stored.declarativeSignalSkills],
    declarativeExclusionSkills: [...stored.declarativeExclusionSkills],
    lastModifiedAt: stored.lastModifiedAt ?? null,
  };
}

// ---------------------------------------------------------------------------
// Lifecycle: seed + load
// ---------------------------------------------------------------------------

/**
 * Seed storage if absent or version-bumped.
 * SKILL-02: Guard with version check — only write when key is absent OR version differs.
 * Mirrors SelectorRegistry.seedIfNeeded() (selector-registry.ts lines 167-174).
 */
export async function seedIfNeeded(): Promise<void> {
  registerOnChangedListener();
  const { skillRegistry } = await storageGet(['skillRegistry']);

  if (!skillRegistry || skillRegistry.version !== SKILL_REGISTRY_VERSION) {
    // Additive migration preserves declarative skills across a version bump (WR-03)
    // instead of destructively resetting them to an empty seed.
    await storageSet({ skillRegistry: migrate(skillRegistry) });
  }
}

/**
 * Load registry from storage into in-memory cache.
 * No TTL eviction — skill definitions have no TTL (unlike selector candidates).
 * Mirrors SelectorRegistry.load() (selector-registry.ts lines 186-204, without eviction).
 */
export async function load(): Promise<void> {
  registerOnChangedListener();
  const { skillRegistry } = await storageGet(['skillRegistry']);
  _cache = skillRegistry ?? buildSeedRegistry();
}

// ---------------------------------------------------------------------------
// Sync getters — pre-load fallback to code seeds
// ---------------------------------------------------------------------------

/**
 * Return the ordered list of signal skills to run.
 * If cache is not yet warm (pre-load), returns only CODE_SIGNAL_SKILLS (D-06 fallback).
 * After load(), appends declarative skills from storage.
 *
 * Order: CODE_SIGNAL_SKILLS (exact step-order) + _cache.declarativeSignalSkills
 */
export function getSignalSkills(): SignalSkill[] {
  if (!_cache) return CODE_SIGNAL_SKILLS; // pre-load fallback (D-06)
  return [...CODE_SIGNAL_SKILLS, ..._cache.declarativeSignalSkills];
}

/**
 * Return the ordered list of exclusion skills to run.
 * If cache is not yet warm, returns only CODE_EXCLUSION_SKILLS (D-06 fallback).
 * After load(), appends declarative exclusion skills from storage.
 *
 * Order: CODE_EXCLUSION_SKILLS (priority order) + _cache.declarativeExclusionSkills
 */
export function getExclusionSkills(): ExclusionSkill[] {
  if (!_cache) return CODE_EXCLUSION_SKILLS; // pre-load fallback
  return [...CODE_EXCLUSION_SKILLS, ..._cache.declarativeExclusionSkills];
}

// ---------------------------------------------------------------------------
// Single-writer: addDeclarativeSkill
// ---------------------------------------------------------------------------

/**
 * Persist a new declarative PatternSkill to storage.
 *
 * SINGLE WRITER (CLAUDE.md constraint #1): Only SkillRegistry writes the
 * 'skillRegistry' storage key. No other module may call storageSet({ skillRegistry }).
 *
 * Mirrors SelectorRegistry.insertCandidate() pattern (selector-registry.ts line 387).
 *
 * Dedups by id: re-adding a skill with an existing id REPLACES it rather than
 * appending a duplicate (WR-04 — duplicates double-count weight into the score).
 * Builds a new array and reassigns _cache immutably rather than mutating in place,
 * so a concurrent onChanged refresh from another tab cannot interleave with a
 * half-applied mutation (WR-04 lost-update race). Invalidates the pattern-runner's
 * compiled-regex cache for this id so a replaced skill's new patterns take effect
 * (WR-02). Surfaces persist failures by rolling back the in-memory cache and
 * rethrowing, instead of silently swallowing them.
 */
export async function addDeclarativeSkill(skill: PatternSkill): Promise<void> {
  if (!_cache) return; // No-op if cache is not warm (pre-load guard)

  const previous = _cache;

  // Replace an existing skill of the same id, else append — never duplicate (WR-04).
  const withoutDup = previous.declarativeSignalSkills.filter(s => s.id !== skill.id);
  const nextSignalSkills = [...withoutDup, skill];

  // Build a fresh schema object and reassign _cache immutably (WR-04 race-safe).
  const next: SkillRegistrySchema = {
    ...previous,
    declarativeSignalSkills: nextSignalSkills,
    lastModifiedAt: new Date().toISOString(),
  };
  _cache = next;

  // The replaced/added skill's patterns may differ from a previously compiled
  // version under the same id — drop its stale compiled regexes (WR-02).
  clearCompiledCache(skill.id);

  try {
    // Single persist write (only SkillRegistry writes skillRegistry — CLAUDE.md #1)
    await storageSet({ skillRegistry: next });
  } catch (err) {
    // Roll back the in-memory mutation so the cache does not run ahead of storage,
    // then surface the failure to the caller (WR-04 — no silent drop).
    if (_cache === next) _cache = previous;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// chrome.storage.onChanged listener — cross-tab cache refresh
// ---------------------------------------------------------------------------

/**
 * chrome.storage.onChanged listener — registered lazily on first call.
 * When another tab writes skillRegistry, refresh _cache from newValue.
 * Active before any await so it's ready to catch writes from other tabs during load().
 * Mirrors SelectorRegistry.registerOnChangedListener() (selector-registry.ts lines 408-439).
 */
let _onChangedListenerRegistered = false;

function registerOnChangedListener(): void {
  if (_onChangedListenerRegistered) {
    return;
  }

  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged?.addListener) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') {
          return;
        }

        if (changes['skillRegistry']) {
          _cache = (changes['skillRegistry'].newValue as SkillRegistrySchema) ?? null;
          // Another tab replaced the registry — any skill it changed may have new
          // patterns under an existing id. Drop the whole compiled-regex cache so the
          // runner recompiles from the refreshed skills (WR-02).
          clearCompiledCache();
        }
      });
      _onChangedListenerRegistered = true;
    }
  } catch {
    // chrome.storage not available (e.g., in tests) — silent fail
  }
}
