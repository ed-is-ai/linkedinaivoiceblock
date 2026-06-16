---
name: open-to-work-exclusion
description: "Metadata passthrough skill that detects open-to-work frames on posts. CRITICAL: always returns excluded:false — this is NOT an exclusion. A detected open-to-work frame only raises the auto-hide threshold by +20 points (fail-safe toward showing content). Must run last (priority 4) in the exclusion pipeline, after sponsored, company-page, and non-english."
metadata:
  kind: exclusion
---
