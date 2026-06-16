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

// Exclusion skills — imported in priority order (matches checkExclusions())
import { sponsoredExclusionSkill } from './exclusions/sponsored.skill';
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
 */
const CODE_EXCLUSION_SKILLS: ExclusionSkill[] = [
  sponsoredExclusionSkill,
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
    await storageSet({ skillRegistry: buildSeedRegistry() });
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
 * Fire-and-forget from callers — use .catch(() => {}) is applied internally.
 */
export async function addDeclarativeSkill(skill: PatternSkill): Promise<void> {
  if (!_cache) return; // No-op if cache is not warm (pre-load guard)
  _cache.declarativeSignalSkills.push(skill);
  _cache.lastModifiedAt = new Date().toISOString();
  // Single persist write (only SkillRegistry writes skillRegistry — CLAUDE.md #1)
  await storageSet({ skillRegistry: _cache }).catch(() => {});
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
        }
      });
      _onChangedListenerRegistered = true;
    }
  } catch {
    // chrome.storage not available (e.g., in tests) — silent fail
  }
}
