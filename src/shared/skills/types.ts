/**
 * LinkedIn Blocker — Host-Agnostic Skill Type Contracts
 *
 * This module is the single source of truth for all skill interfaces in the
 * skill registry architecture (Phase 30, D-01 through D-04).
 *
 * Invariants:
 *   - Host-agnostic: NO chrome.* APIs, NO runtime DOM calls (document.*, querySelector()).
 *     `Element` appears ONLY as a type annotation (lib.dom ambient type).
 *   - PatternSkill is the ONLY LLM-authorable skill flavor. MV3 Content Security Policy
 *     forbids eval/new Function at runtime, so pattern rules are stored as DATA (strings,
 *     keyword arrays, numeric thresholds) and executed by the pattern-runner — not by the
 *     skill itself (D-02).
 *   - CodeSkill (flavor: 'code') runs imperative TypeScript compiled into the extension
 *     bundle; it is NOT LLM-authorable.
 *   - DetectorSkill (kind: 'detector') is the skill analog of the existing Detector
 *     interface — adds a `kind` discriminant for registry dispatch.
 */

import type { PostData, DetectionResult, ExclusionResult } from '../types';

// ---------------------------------------------------------------------------
// Version constant
// ---------------------------------------------------------------------------

export const SKILL_REGISTRY_VERSION = '1.0.0';

// ---------------------------------------------------------------------------
// Signal skill base & flavors
// ---------------------------------------------------------------------------

/** Inputs a signal skill reads from. Profile signals are handled outside the registry. */
export type SignalInput = 'text' | 'profile' | 'comments';

/**
 * Common fields for all signal skills.
 * `id` matches both the signalBreakdown key and the detectionConfig weight key (D-04).
 */
export interface SignalSkillBase {
  kind: 'signal';
  /** Unique identifier — matches signalBreakdown key AND detectionConfig weight key (D-04) */
  id: string;
  /** Which post data fields this skill reads */
  inputs: SignalInput[];
  /**
   * True if run() is synchronous (pure computation, no network/DOM await).
   * False only for generic-comments (fetches DOM comments asynchronously).
   */
  sync: boolean;
}

/** Execution context passed to CodeSkill.run() */
export interface SignalContext {
  postData: PostData;
  /** Lazy comment fetcher — only provided by the runner for async skills */
  fetchComments?: (post: PostData) => Promise<string[]>;
}

/**
 * An imperative TypeScript skill compiled into the extension bundle.
 * Authored by extension developers, not by LLMs.
 */
export interface CodeSkill extends SignalSkillBase {
  flavor: 'code';
  /** Return the numeric score contribution for this signal (0 = no signal) */
  run(ctx: SignalContext): number | Promise<number>;
}

/**
 * A declarative pattern rule for the pattern-runner.
 * Stored as DATA only — no executable code. MV3 CSP forbids eval/new Function (D-02).
 *
 * Three rule kinds:
 *   - keyword-set  : match against a list of keywords (any-match or density threshold)
 *   - regex        : patterns as STRINGS (compiled to RegExp by the runner, not eval)
 *   - numeric-threshold : apply a named extractor function and compare to a threshold
 */
export type PatternRule =
  | {
      kind: 'keyword-set';
      keywords: string[];
      matchMode: 'any' | 'density';
      /** Only meaningful when matchMode === 'density' */
      densityThreshold?: number;
    }
  | {
      kind: 'regex';
      /** Patterns are STRINGS — never compiled functions. The runner calls new RegExp(str). */
      patterns: string[];
      minHits: number;
    }
  | {
      kind: 'numeric-threshold';
      /** Named extractor function the runner dispatches on. Exhaustive union prevents unknown fns. */
      extractFn: 'em-dash-density' | 'word-count';
      operator: '>';
      value: number;
    };

/**
 * A declarative pattern skill authorable by LLMs.
 * The skill carries data only — NO run() method.
 * The pattern-runner (src/shared/skills/pattern-runner.ts) executes it.
 */
export interface PatternSkill extends SignalSkillBase {
  flavor: 'pattern';
  /** Path into detectionConfig.weights that determines the score contribution */
  weightKey: string;
  rule: PatternRule;
  // Deliberately NO run() — executed by PatternSkillRunner, not the skill (D-02, MV3 CSP)
}

// ---------------------------------------------------------------------------
// Exclusion skill
// ---------------------------------------------------------------------------

/**
 * An exclusion gate that decides whether a post should be skipped before detection.
 * `postNode` is a type-only reference to `Element` from lib.dom — no runtime DOM call
 * is made in this file; the skill implementation (in content/) makes the actual DOM call.
 */
export interface ExclusionSkill {
  kind: 'exclusion';
  /** 'sponsored' | 'company-page' | 'non-english' | 'open-to-work' */
  id: string;
  check(postData: PostData, postNode: Element): ExclusionResult;
}

// ---------------------------------------------------------------------------
// Detector skill
// ---------------------------------------------------------------------------

/**
 * Skill analog of the existing `Detector` interface (src/shared/types.ts L66-71).
 * Adds a `kind` discriminant for registry dispatch while remaining drop-in compatible.
 * Both HeuristicDetector and LLMDetector implement Detector AND DetectorSkill.
 */
export interface DetectorSkill {
  kind: 'detector';
  /** Human-readable identifier: 'heuristic' | 'llm' */
  name: string;
  detect(post: PostData): Promise<DetectionResult>;
}

// ---------------------------------------------------------------------------
// Union types
// ---------------------------------------------------------------------------

/** Any signal-producing skill (imperative or declarative) */
export type SignalSkill = CodeSkill | PatternSkill;

/** Any skill managed by the registry */
export type AnySkill = DetectorSkill | SignalSkill | ExclusionSkill;

// ---------------------------------------------------------------------------
// Tool contract (Phase 32 — D-01, D-04)
// ---------------------------------------------------------------------------

/**
 * A first-class imperative capability that MAY perform host I/O
 * (network, chrome.storage, DOM read/write) — distinct from the
 * host-agnostic skill types (SignalSkill / ExclusionSkill / DetectorSkill).
 *
 * Tools are NOT part of AnySkill — the I/O boundary is the discriminator (D-01).
 * Tools live in src/skills/library/ with SKILL.md metadata.kind: 'tool'.
 * ToolRegistry (src/shared/tool-registry.ts) is the runtime lookup point.
 */
export interface Tool<I, O> {
  /** Unique identifier — matches the library folder name */
  name: string;
  /** One-sentence description of what this tool does */
  description: string;
  /** Execute the tool. May perform network, chrome.storage, or DOM I/O. */
  execute(input: I): Promise<O>;
}

// ---------------------------------------------------------------------------
// Registry storage schema
// ---------------------------------------------------------------------------

/**
 * Shape of the skill registry as stored in chrome.storage.local under 'skillRegistry'.
 * Code-defined skills (CodeSkill, ExclusionSkill implementations) are NOT stored here —
 * they are statically imported and merged at runtime (D-06).
 * Only declarative (PatternSkill) skills authored by LLMs live in storage.
 */
export interface SkillRegistrySchema {
  version: string;
  /** LLM-authored declarative signal skills. Empty array at launch (D-06). */
  declarativeSignalSkills: PatternSkill[];
  /** LLM-authored declarative exclusion skills. Empty array at launch (D-06). */
  declarativeExclusionSkills: ExclusionSkill[];
  /** ISO 8601 timestamp of last modification, or null if seed-only */
  lastModifiedAt: string | null;
}
