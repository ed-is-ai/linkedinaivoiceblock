/**
 * LinkedIn Blocker — Trace Store
 *
 * Manages persistence of LLM call traces in chrome.storage.local.
 * Implements newest-first ordering and a 500-entry FIFO cap with oldest-entry eviction.
 *
 * Pattern: mirrors postStore.ts (cap 200) — read → prepend → cap → write.
 * Unlike postStore, there is NO deduplication (every call gets a trace entry, D-03)
 * and NO text truncation at this layer (userPrompt is truncated by the Plan 02 caller).
 *
 * Shared module — must NOT import from content/ and must NOT reference the
 * document or the extension runtime. Only chrome.storage.local (via storage wrappers).
 */

import { storageGet, storageSet } from './storage';
import type { TraceEntry } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Maximum number of LLM call traces before oldest is evicted (TRACE-03).
 * After the 501st append the array length is exactly 500.
 */
export const TRACE_STORE_CAP = 500;

// ---------------------------------------------------------------------------
// appendTrace
// ---------------------------------------------------------------------------

/**
 * Serialized write chain. Every trace append in the service worker runs through this
 * single promise chain so concurrent appends cannot interleave their read-modify-write
 * and clobber each other (the detector scores many posts in quick succession). The
 * service worker is the SOLE writer of llbTraces, so serializing here fully closes the
 * lost-update race. Each link swallows its own error so one failed write never breaks
 * the chain or rejects the caller — trace recording is observability only and must never
 * affect the response path.
 */
let writeChain: Promise<void> = Promise.resolve();

/**
 * Append a new LLM call trace entry to chrome.storage.local.
 *
 * - Prepends the entry to the array (newest first)
 * - Evicts the oldest entry (pop) when the array exceeds TRACE_STORE_CAP
 * - No deduplication — every call produces a trace entry (D-03)
 * - No text truncation — userPrompt is already truncated by the caller (D-04)
 * - Serialized + non-rejecting: safe to call fire-and-forget from the response path.
 *   `await appendTrace(...)` resolves once this entry's write (and all earlier queued
 *   writes) have landed.
 *
 * @param entry - The TraceEntry to persist (success or error trace)
 */
export function appendTrace(entry: TraceEntry): Promise<void> {
  writeChain = writeChain
    .then(async () => {
      const { llbTraces = [] } = await storageGet(['llbTraces']);

      // Prepend (newest first) — same idiom as postStore.ts
      const updated = [entry, ...(llbTraces as TraceEntry[])];

      // Evict oldest if over cap (pop removes last element = oldest)
      // Do NOT use slice() — pop() is the established idiom in this codebase (PATTERNS.md)
      if (updated.length > TRACE_STORE_CAP) updated.pop();

      await storageSet({ llbTraces: updated });
    })
    // Swallow per-write errors: a trace write must never reject the caller or break
    // the chain for subsequent appends.
    .catch(() => {});

  return writeChain;
}
