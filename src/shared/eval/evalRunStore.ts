/**
 * LinkedIn Blocker — Eval Run Store
 *
 * Manages persistence of eval run records in chrome.storage.local.
 * Implements newest-first ordering and a 50-entry FIFO cap with oldest-entry eviction.
 *
 * Pattern: mirrors src/shared/traceStore.ts exactly —
 *   - Serialized writeChain prevents concurrent read-modify-write interleaving (T-28-04)
 *   - pop() (not slice()) for eviction — established codebase idiom
 *   - Non-rejecting: write errors swallowed, never rejects the caller (observability path)
 *
 * Shared module — must NOT import from content/ and must NOT reference the
 * document or the extension runtime. Only chrome.storage.local (via storage wrappers).
 */

import { storageGet, storageSet } from '../storage';
import type { EvalRun } from './runs';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** chrome.storage.local key for the eval runs array. */
export const EVAL_RUNS_KEY = 'evalRuns' as const;

/**
 * Maximum number of eval run records before the oldest is evicted (D-03).
 * After the 51st append the array length is exactly 50.
 */
export const MAX_EVAL_RUNS = 50;

// ---------------------------------------------------------------------------
// appendEvalRun
// ---------------------------------------------------------------------------

/**
 * Serialized write chain. Every eval run append runs through this single promise
 * chain so concurrent appends cannot interleave their read-modify-write and clobber
 * each other (T-28-04 — mirrors traceStore.ts). Each link swallows its own error so
 * one failed write never breaks the chain or rejects the caller.
 */
let writeChain: Promise<void> = Promise.resolve();

/**
 * Append a new eval run record to chrome.storage.local.
 *
 * - Prepends the run to the array (newest first)
 * - Evicts the oldest entry (pop) when the array exceeds MAX_EVAL_RUNS
 * - Serialized + non-rejecting: safe to call fire-and-forget.
 *   `await appendEvalRun(...)` resolves once this entry's write (and all earlier
 *   queued writes) have landed.
 *
 * @param run - The EvalRun record to persist
 */
export function appendEvalRun(run: EvalRun): Promise<void> {
  writeChain = writeChain
    .then(async () => {
      const { evalRuns = [] } = await storageGet([EVAL_RUNS_KEY]);

      // Prepend (newest first) — same idiom as traceStore.ts / postStore.ts
      const updated = [run, ...(evalRuns as EvalRun[])];

      // Evict oldest if over cap (pop removes last element = oldest)
      // Do NOT use slice() — pop() is the established idiom in this codebase (T-28-02)
      if (updated.length > MAX_EVAL_RUNS) updated.pop();

      await storageSet({ evalRuns: updated });
    })
    // Swallow per-write errors: an eval run write must never reject the caller or
    // break the chain for subsequent appends.
    .catch(() => {});

  return writeChain;
}

// ---------------------------------------------------------------------------
// getEvalRuns
// ---------------------------------------------------------------------------

/**
 * Read all persisted eval run records from chrome.storage.local.
 *
 * Returns the stored array newest-first, or an empty array if the key is absent.
 */
export async function getEvalRuns(): Promise<EvalRun[]> {
  const { evalRuns = [] } = await storageGet([EVAL_RUNS_KEY]);
  return evalRuns as EvalRun[];
}
