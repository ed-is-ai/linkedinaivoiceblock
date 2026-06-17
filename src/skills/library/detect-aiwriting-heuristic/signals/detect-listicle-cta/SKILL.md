---
name: detect-listicle-cta
description: "Composite signal that scores posts containing listicle formatting (numbered lists, bullet patterns) combined with call-to-action phrases. Single CodeSkill calling both checkListicle and checkCta — MUST NOT be split into two skills. Tier weight read from detectionConfig.weights.listicleCta."
metadata:
  kind: signal
---
