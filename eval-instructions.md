# Eval Runner — Step-by-Step Instructions

How to import labeled post data and produce an accuracy/cost report for the
LinkedIn Blocker AI detector.

The eval is a **developer CLI** (`npm run eval`). It re-scores each labeled post
fresh through the same LLM classifier the extension uses, compares the score
against your ground-truth label across a sweep of detection thresholds, and
reports precision / recall / F1 / accuracy plus the LLM cost. There is **no UI** —
everything happens in the terminal and in a results JSON file.

> Commands below use **PowerShell** (Windows). bash/zsh equivalents are noted
> where they differ.

---

## What you need

| Requirement | Notes |
|-------------|-------|
| Node + npm, deps installed | `npm install` once if you haven't |
| An Anthropic API key | The eval makes **one LLM call per labeled post** — it costs money |
| A **labeled** Export JSON | Exported from the dashboard, then labeled (steps below) |

---

## Step 1 — Export the data from the dashboard

1. Open the extension's **Dashboard** page (the dashboard is a dedicated
   extension page — open it from the extension popup / the extension's options).
2. Under **Export data**, click **Export JSON**.
3. Your browser downloads a file named `linkedin-blocker-YYYY-MM-DD.json`
   (e.g. into `Downloads/`).

This file has three top-level arrays. The eval reads **only two** of them:

```json
{
  "exportedAt": "2026-06-14T...",
  "flaggedPosts":   [ { "text": "..." }, ... ],   // posts the detector flagged
  "unflaggedPosts": [ { "text": "..." }, ... ],   // posts the detector let through
  "flaggedAccounts": [ ... ]                       // IGNORED by the eval
}
```

---

## Step 2 — Label the posts (this is the "import" step)

The exported posts are **unlabeled**. The eval needs to know the *truth* for each
post so it can grade the model's score. Add a `"label"` field to each post you
want graded, with the value `"ai"` or `"human"`:

```json
{
  "flaggedPosts": [
    { "text": "Unlocking synergies in today's fast-paced...", "label": "ai" },
    { "text": "Had a great coffee with an old colleague.",     "label": "human" }
  ],
  "unflaggedPosts": [
    { "text": "We're hiring! DM me.", "label": "human" }
  ]
}
```

Rules the walker enforces:

- A post is graded **only** if it has `"label": "ai"` or `"label": "human"`.
- Posts with **no `label`** are **skipped** (counted, but not scored) — so you can
  label just a subset for a quick/cheap run and leave the rest unlabeled.
- A post with an invalid label (e.g. `"maybe"`) is skipped with a warning.
- Non-object / `null` entries are skipped with a warning.
- If **zero** posts end up labeled, the eval exits with an error (see exit codes).

> Tip: each labeled post = one API call. For a cheap smoke test, label ~6 obvious
> AI posts (`ai`) and ~6 obvious human posts (`human`) and leave the rest.

Save the labeled file somewhere convenient, e.g. `eval/labeled.json`.

---

## Step 3 — Set your API key

PowerShell (current session only):

```powershell
$env:ANTHROPIC_API_KEY = "sk-ant-..."
```

bash/zsh:

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

The key is read from the environment, used only for the LLM calls, and is
**never printed and never written to the results file**.

---

## Step 4 — Run the eval

Pass the path to your labeled file. The `--` is **required** so npm forwards the
path to the script:

```powershell
npm run eval -- "eval/labeled.json"
```

If the path has spaces or parentheses, quote it:

```powershell
npm run eval -- "C:\Users\You\Downloads\linkedin-blocker-2026-06-14 (6).json"
```

Equivalent direct invocation (skips npm's `--` quirk):

```powershell
npx tsx scripts/eval.ts "eval/labeled.json"
```

---

## Step 5 — Read the report

### 5a. Terminal output

While running, you see a header line per scored post, followed by that post's
**per-signal breakdown** (highest contribution first) and the model's one-line
reasoning — the same `{ signal: points }` shape stored on `flaggedAccounts` in
the export, but computed fresh per post:

```
Eval: 12 labeled posts (43 unlabeled skipped, 55 total).

  [1/12] score=82 label=ai confidence=high | running cost $0.001234
       formulaic-structure         25
       buzzword-density            18
       em-dash-overuse             12
       reasoning: Generic motivational arc with listicle cadence.
  [2/12] score=15 label=human confidence=low | running cost $0.002470
       (no signals)
       reasoning: Specific anecdote with a named colleague and concrete detail.
  ...
```

> **Note on signal names:** these come from the **LLM** classifier (the engine
> the eval grades). They are *not* the same vocabulary as the heuristic signals
> (`buzzword`, `template`, `no-specificity`, …) stored on `flaggedAccounts` in
> the export — those are produced by the in-browser heuristic detector. Same
> shape, different engine.

Then a **threshold sweep table** (thresholds 35→90, step 5) — for each cutoff,
how the model's scores grade against your labels:

```
| threshold | precision | recall |   f1  | accuracy |
|----------:|----------:|-------:|------:|---------:|
|        35 |     0.750 |  1.000 | 0.857 |    0.833 |
|        50 |     0.900 |  0.900 | 0.900 |    0.917 | <- best F1
|        90 |     1.000 |  0.500 | 0.667 |    0.750 |
```

- **precision** — of posts the model flagged at this threshold, how many were truly AI
- **recall** — of truly-AI posts, how many the model caught
- **f1** — harmonic mean of precision & recall (the headline accuracy metric)
- **accuracy** — overall fraction graded correctly
- `<- best F1` marks the threshold with the highest F1 (the suggested cutoff)
- A metric shows `n/a` when it's undefined (e.g. nothing predicted positive) — never a crash

Finally a one-line **paste-able summary** + cost:

```
Eval 2026-06-14 | 12 posts | best F1 @T=50 (P=0.900 R=0.900 F1=0.900) | cost $0.014820 total ($0.001235/post)

Results written to: .../eval/results-2026-06-14.json
```

### 5b. The results file (the durable report)

A machine-readable report is written to **`eval/results-YYYY-MM-DD.json`**
(re-running on the same day overwrites it). Structure:

```json
{
  "runAt": "2026-06-14T23:10:00.000Z",
  "inputFile": "eval/labeled.json",
  "model": "claude-sonnet-4-6",
  "counts": {
    "total": 55,        // all entries in both arrays
    "labeled": 12,      // entries that had a valid label
    "skipped": 43,      // unlabeled / invalid entries
    "errored": 0,       // posts whose LLM call failed
    "scored": 12        // posts successfully scored
  },
  "cost": {
    "totalUsd": 0.014820,
    "avgUsdPerPost": 0.001235
  },
  "thresholds": [
    { "threshold": 35, "tp": 6, "fp": 2, "tn": 3, "fn": 0,
      "precision": 0.75, "recall": 1.0, "f1": 0.857, "accuracy": 0.833 },
    ...
  ],
  "bestF1Threshold": 50,
  "posts": [
    {
      "index": 1,
      "label": "ai",
      "score": 82,
      "confidence": "high",
      "signalBreakdown": { "formulaic-structure": 25, "buzzword-density": 18, "em-dash-overuse": 12 },
      "reasoning": "Generic motivational arc with listicle cadence.",
      "textPreview": "Unlocking synergies in today's fast-paced..."
    }
    // ... one entry per scored post
  ]
}
```

The **`posts[]`** array is the per-post detail: each scored post's `score`,
`confidence`, the full `signalBreakdown` (`{ signal: points }`), the LLM
`reasoning`, and an 80-char `textPreview` so the file is readable on its own.
Use it to see *why* a given post scored the way it did, not just the aggregate
metrics.

Use `bestF1Threshold` + the matching `thresholds[]` row as the recommended
detector cutoff, and `cost.totalUsd` to track spend across runs. Keep these
files in `eval/` to compare accuracy over time as prompts/models change.

---

## Exit codes (for scripting / CI)

The CLI exits **non-zero (1)** with a clear stderr message on any bad input, and
**0** on success. Each guard, in order:

| Condition | stderr message |
|-----------|----------------|
| No file argument | `Usage: npm run eval <labeled-posts.json>` |
| File missing / unreadable / not JSON | `Error: Could not read or parse file: <path>` |
| Valid JSON but not an object (e.g. `null`, an array) | `Error: Could not read or parse file: <path>` |
| Missing `flaggedPosts` / `unflaggedPosts` arrays | `Error: JSON must contain "flaggedPosts" and "unflaggedPosts" arrays.` |
| `ANTHROPIC_API_KEY` not set | `Error: ANTHROPIC_API_KEY environment variable is not set.` |
| No labeled posts found | `Error: No labeled posts found (N unlabeled entries skipped)...` |

Check the result in PowerShell with `$LASTEXITCODE` (should be `0` after a good run).

---

## Quick reference

```powershell
# 1. export from dashboard  ->  linkedin-blocker-YYYY-MM-DD.json
# 2. add "label": "ai" | "human" to posts you want graded
# 3. key
$env:ANTHROPIC_API_KEY = "sk-ant-..."
# 4. run
npm run eval -- "eval/labeled.json"
# 5. read terminal table + eval/results-YYYY-MM-DD.json
```
