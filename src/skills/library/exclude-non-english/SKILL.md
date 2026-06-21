---
name: exclude-non-english
description: "Excludes non-English posts before any detection runs. Delegates to isNonEnglish() from src/content/detector/language.ts which checks DOM lang attribute and Unicode script analysis. Must run third (priority 3) in the exclusion pipeline, after sponsored and company-page and before open-to-work."
metadata:
  kind: exclusion
---
