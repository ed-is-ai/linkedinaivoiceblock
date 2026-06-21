---
status: complete
phase: 28-evals-dashboard-future
source: [28-01-SUMMARY.md, 28-02-SUMMARY.md, 28-03-SUMMARY.md]
started: 2026-06-15T00:00:00Z
updated: 2026-06-15T00:00:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Run `npm run build`, then reload the unpacked extension from `dist/`. Extension loads with no manifest/console errors. Popup opens, dashboard opens, and the Evals page (dashboard/evals.html) loads without errors.
result: pass
note: Empty/zero state with no labeled posts or runs yet — expected.

### 2. Open Evals from Popup
expected: In the popup, a "View Evals" button sits next to "View Dashboard". Clicking it opens dashboard/evals.html in a new tab.
result: pass

### 3. Open Evals from Dashboard
expected: On the dashboard's Data-management card, an Evals link/button opens dashboard/evals.html in a new tab.
result: pass

### 4. Evals Page Shell Renders
expected: The Evals page shows all sections — run controls (engine toggle + Run button), a 4-metric grid, a threshold sweep table, an error-analysis area, and a labeling section. If storage read fails, a friendly load-error message appears instead of a blank page.
result: pass

### 5. Click-to-Label Posts
expected: Each post row (merged flagged + unflagged posts) shows a text preview, the current label indicator, and AI / Human segmented buttons. Clicking AI or Human sets that post's label and the indicator updates immediately.
result: pass

### 6. Bulk-Seed Labels
expected: Clicking "Bulk: flagged→AI, unflagged→Human" seeds labels for unlabeled posts (flagged→AI, unflagged→Human). The "N labeled of M posts" summary updates. Clicking again does NOT overwrite any labels you set manually (idempotent).
result: pass

### 7. Run Heuristic Eval
expected: Select the heuristic engine and click Run. No cost confirmation modal appears (heuristic is free/fast). Progress shows scored/total, then the results sections populate.
result: pass

### 8. Run LLM Eval with Cost Modal
expected: Select the LLM engine and click Run. A confirm modal appears showing the post count and an estimated cost. Cancel aborts before any scoring. Approve starts the run with a live progress readout (scored/total + running cost estimate) and a working Cancel button.
result: pass

### 9. Cancel / Partial Run
expected: Cancelling an LLM run mid-way (or running with fewer scored than labeled) still saves a run, marked with an amber "partial" badge next to the Results heading.
result: pass

### 10. Results — Metric Grid & Threshold Sweep
expected: After a run, the 4-metric grid shows Precision / Recall / F1 / Accuracy. The threshold sweep table shows 12 rows (35–90, step 5); the best-F1 row is highlighted (blue background, bold) with a "◀ best" marker.
result: pass

### 11. FP/FN Error Cards
expected: The error-analysis area shows false-positive and false-negative posts as cards. Each card shows the post text preview and signal pills sorted by score (highest first).
result: pass
note: |
  Initially reported truncated ("It's working but the text is cutoff. Can you wrap?") — cosmetic.
  Fixed in commit ab44246 (ERR_PREVIEW_LEN=280, errText wraps, overflow-wrap). Verified pass on a
  fresh run. Note: previews are baked into stored runs, so pre-fix runs still show 80-char text;
  only runs created after the fix wrap.

### 12. Compare Δ Table
expected: When a prior run of the same engine exists, a compare table shows F1 / Precision / Recall / Cost for the current run, the baseline run, and the delta (Δ) — coloured green for improvement, red for regression.
result: pass

## Summary

total: 12
passed: 12
issues: 0
pending: 0
skipped: 0
blocked: 0
note: 1 issue found and fixed during the session (test 11, cosmetic — commit ab44246).

## Gaps

- truth: "FP/FN error cards show the post text in a readable form"
  status: resolved
  fix_commit: ab44246
  verified: true
  reason: "User reported: It's working but the text is cutoff. Can you wrap?"
  severity: cosmetic
  test: 11
  root_cause: "FP/FN card text is truncated at the data layer, not by CSS. evals.tsx:233 builds PostDetail.textPreview as post.text.slice(0, 80) and evals.tsx:635 appends '…' when length>=80. The errText style (evals.tsx:877) already wraps (no nowrap/ellipsis), so removing/raising the 80-char data cap lets the full text wrap across lines."
  artifacts:
    - path: "src/dashboard/evals.tsx"
      issue: "Line 233 caps textPreview to 80 chars (post.text.slice(0,80)); line 635 appends ellipsis at >=80"
  missing:
    - "Increase or remove the 80-char slice so FP/FN cards receive enough text to read"
    - "Keep errText wrapping (already wraps); drop or adjust the >=80 ellipsis suffix so it only shows when text is actually truncated"
  debug_session: ""
