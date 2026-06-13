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
 * Append a new LLM call trace entry to chrome.storage.local.
 *
 * - Prepends the entry to the array (newest first)
 * - Evicts the oldest entry (pop) when the array exceeds TRACE_STORE_CAP
 * - No deduplication — every call produces a trace entry (D-03)
 * - No text truncation — userPrompt is already truncated by the caller (D-04)
 *
 * @param entry - The TraceEntry to persist (success or error trace)
 */
export async function appendTrace(entry: TraceEntry): Promise<void> {
  const { llbTraces = [] } = await storageGet(['llbTraces']);

  // Prepend (newest first) — same idiom as postStore.ts
  const updated = [entry, ...(llbTraces as TraceEntry[])];

  // Evict oldest if over cap (pop removes last element = oldest)
  // Do NOT use slice() — pop() is the established idiom in this codebase (PATTERNS.md)
  if (updated.length > TRACE_STORE_CAP) updated.pop();

  await storageSet({ llbTraces: updated });
}
