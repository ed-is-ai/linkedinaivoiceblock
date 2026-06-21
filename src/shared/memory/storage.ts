/**
 * LinkedIn Blocker — Typed chrome.storage.local Wrapper
 *
 * Per CLAUDE.md constraint #4 and PITFALLS.md COMMON-9:
 *   - Uses chrome.storage.local EXCLUSIVELY.
 *   - The sync storage area is NEVER used (10 MB local vs 100 KB sync; no rate limits).
 *
 * All functions are generic over StorageSchema so that shape drift is caught at
 * compile time under strict mode + noUncheckedIndexedAccess (T-03-03 mitigation).
 *
 * Usage:
 *   import { storageGet, storageSet, storageRemove } from '../shared/memory/storage';
 *   const { flaggedAccounts } = await storageGet(['flaggedAccounts']);
 */

import type { StorageSchema } from '../types';

/**
 * Read one or more keys from chrome.storage.local.
 * Returns a partial object containing only the requested keys.
 *
 * @param keys - Array of StorageSchema keys to retrieve
 * @returns Promise resolving to the subset of StorageSchema for the given keys
 */
export async function storageGet<K extends keyof StorageSchema>(
  keys: K[]
): Promise<Pick<StorageSchema, K>> {
  return chrome.storage.local.get(keys) as Promise<Pick<StorageSchema, K>>;
}

/**
 * Write one or more key–value pairs to chrome.storage.local.
 * Pass a Partial<StorageSchema> — only the supplied keys are written.
 *
 * @param values - Partial StorageSchema object with keys and values to persist
 */
export async function storageSet(values: Partial<StorageSchema>): Promise<void> {
  return chrome.storage.local.set(values);
}

/**
 * Remove one or more keys from chrome.storage.local.
 *
 * @param keys - Array of StorageSchema keys to delete
 */
export async function storageRemove<K extends keyof StorageSchema>(
  keys: K[]
): Promise<void> {
  return chrome.storage.local.remove(keys as string[]);
}
