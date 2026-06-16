---
name: heuristic-detector
description: "Rule-based detector that scores posts using registered signal skills via the registry runner. Implements the Detector interface (CONFIG-02) and DetectorSkill discriminant (kind: detector). Two-pass runner: sync skills in pipeline step-order (Pass 1), then async gated skills (Pass 2, generic-comments only). Orchestration layer only — all scoring logic lives in the individual signal modules. DOM-free and unit-testable without a browser."
metadata:
  kind: detector
---
