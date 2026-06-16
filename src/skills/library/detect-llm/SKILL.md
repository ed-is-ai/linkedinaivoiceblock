---
name: detect-llm
description: "LLM-based detector that asks the service worker to score posts via Claude Sonnet 4.6. Implements the Detector interface (CONFIG-02) and DetectorSkill discriminant (kind: detector). Content scripts cannot call the Anthropic API directly (CORS) — the actual fetch lives in background/index.ts; this class sends a SCORE_POST message and awaits the response. Falls back to a provided Detector on error."
metadata:
  kind: detector
---
