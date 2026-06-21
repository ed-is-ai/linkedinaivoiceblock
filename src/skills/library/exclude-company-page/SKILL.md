---
name: exclude-company-page
description: "Excludes company/organization page posts before any detection runs. Checks whether the post author profile URL contains the COMPANY_PAGE_MARKER selector resolved via SelectorRegistry. Must run second (priority 2) in the exclusion pipeline, after sponsored and before non-english and open-to-work."
metadata:
  kind: exclusion
---
