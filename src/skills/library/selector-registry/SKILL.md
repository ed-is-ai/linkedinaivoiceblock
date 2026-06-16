---
name: selector-registry
description: "Runtime source of truth for all DOM selector lookups. Maintains an in-memory cache of the SelectorRegistry schema backed by chrome.storage.local. SINGLE-WRITER INVARIANT (CLAUDE.md constraint #1): ONLY the canonical singleton at src/content/selector-registry.ts writes selector strings to chrome.storage.local. This library folder exists for Agent Skills convention completeness (D-02) only — it is NOT wired into any skill array and is NOT imported at runtime."
metadata:
  kind: exclusion
---
