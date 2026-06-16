/**
 * Thin re-export. The canonical SelectorRegistry singleton stays at
 * src/content/selector-registry.ts — do NOT move it.
 *
 * CLAUDE.md constraint #1: ONLY src/content/selector-registry.ts writes
 * selector strings to chrome.storage.local. This file MUST contain NO
 * storageSet call and NO selector string literal.
 *
 * This file exists for tool-library convention completeness (it is kind: tool;
 * tools live under src/tools/library/). It is NOT wired into any tool array and
 * is NOT imported anywhere at runtime.
 */
export {
  buildSeedRegistry,
  seedIfNeeded,
  load,
  resolve,
  updateCandidate,
  candidateConfidence,
  insertCandidate,
  recordMiss,
} from '../../../content/selector-registry';
