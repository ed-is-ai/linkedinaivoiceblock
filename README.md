# LinkedIn AIVoice Blocker

I can't be the only one that's been annoyed by how much of LinkedIn is written by bots and people lazy-writing posts with AI.  I hark back to the days when the platform was genuninely an interesting place to hang out.  So this project is something I built to help me enjoy LinkedIn again.  

Basically a Chrome extension that detects and hides AI-generated "AI voice" posts on LinkedIn before you see them — flags the accounts behind them for review, and tracks the health of your feed so you can see if it is improving.

Some experimental features that I'm still trying to perfect.  Uses browser-sandboxed detection engine built on an agent-style architecture — composable skills and a tools registry — using Claude for classification and self-healing DOM selectors (this part is definitely alpha at best).

It runs in 2 modes:
> **fully local and free by default** (heuristic scoring, no network calls). 
>Add an Anthropic API key and it upgrades to **Claude-powered detection** for higher accuracy using Sonnet.

If you want to share some love back then <br/>
<a href="https://www.buymeacoffee.com/ed.is.ai" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/default-orange.png" alt="Buy Me A Coffee" height="41" width="174"></a>
---

## Key Features

- **Automatic hiding** — AI-generated posts are hidden from the feed via a CSS toggle the
  moment they're scored, before they distract you. Nothing is deleted; hiding is reversible.
- **Two detection engines, one interface** — a zero-cost heuristic scorer ships by default;
  drop in an Anthropic API key to switch to Claude (`claude-sonnet-4-6`). The detection
  call site never changes (see [Approach](#approach)).
- **Hard exclusions first** — sponsored posts, company pages, "open to work" cards, and
  non-English posts are excluded *before* any detection runs, to keep false positives low.
- **Account review queue** — suspicious authors are surfaced in the toolbar popup with their
  signal breakdown and score, so you stay in control. Blocking uses LinkedIn's own
  **report/block deep link** — the extension never simulates clicks (ToS-safe).
- **Feed Health dashboard** — a full-page view of net AI-voice posts over time, all-time
  hidden count, flag/bot rates, and a **Selector Health** panel that tracks whether each
  DOM selector is still matching the live LinkedIn markup.
- **Self-healing selectors** — The extension uses semantic selectors to reduce the natural fragility of a DOM-based scraping approach.  LinkedIn rebuilds its class names on frequently, self-healing capabilty using Claude updates these when it does without a code change.
- **Data export & eval tooling** — export matched behaviour (JSON), blocked posts (CSV), and
  LLM call traces; a built-in evals page allows user to run Evals against performance - measures detector accuracy against their own labelled data.
- **Privacy-first** — uses the Chrome sandbox to mainatin privacy.  All state lives in `chrome.storage.local`. There is no backend, no
  analytics, and no telemetry. The only outbound request is to the Anthropic API, and only if *you* configure a key.

---

## Approach

Each candidate post passes through a short, deterministic pipeline:

```
post node
   │
   ▼
┌──────────────────────┐   excluded?   ┌───────────────┐
│  Hard exclusions     │ ───────────►  │ leave visible │
│  sponsored · company │               └───────────────┘
│  open-to-work · non-EN│
└──────────┬───────────┘
           │ not excluded
           ▼
┌──────────────────────┐
│  Detector.detect()   │   heuristic (default)  OR  Claude (if API key set)
└──────────┬───────────┘
           │ DetectionResult { score, signals }
           ▼
   score ≥ threshold ?  ── yes ──►  hide post (.llb-hidden) + enqueue account for review
           │ no
           ▼
     leave visible
```

**Pluggable detector.** Both engines implement the same contract, so the call site is
engine-agnostic:

```ts
interface Detector {
  detect(postData: PostData): Promise<DetectionResult>;
}
```

- **`HeuristicDetector`** scores posts from a set of composable signals (e.g. AI-vocabulary,
  hook-story openings, listicle/CTA structure, engagement-bait, generic comments). Signals
  live as self-contained "skills" under `src/skills/library/detect-aiwriting-heuristic/`.
- **`LLMDetector`** sends the post text to Claude. Because `linkedin.com` CORS blocks a direct
  `fetch` from the content script, **the Anthropic request is made in the service worker**;
  the content script talks to it over `chrome.runtime.sendMessage`. The system prompt is
  cached (Anthropic prompt caching) to keep cost down.

**No fragile selectors.** Per project rule, no CSS class names are used as selectors. Every
hard-coded selector string lives in one seed file (`selectors.ts`) and is read at runtime
exclusively through the `SelectorRegistry`, which hydrates from storage and can re-derive a
broken selector on the fly.

---

## Architecture

| Component | Responsibility |
|-----------|----------------|
| **Content script** (`src/content/`) | All DOM interaction — a `MutationObserver` watches the feed (and survives SPA navigation), runs exclusions + detection, applies the CSS hide, and enqueues flagged accounts. Owns the `SelectorRegistry`. |
| **Service worker** (`src/background/`) | Stateless message relay — updates the toolbar badge, performs the Anthropic API call for LLM mode, and handles selector-heal / block requests. Terminates when idle; all durable state goes straight to storage. |
| **Popup** (`src/modules/popup/`) | Preact UI rendered fresh on every open. Lists flagged accounts with signal breakdowns, lets you block (deep link) or dismiss false positives, and is where you paste your Anthropic API key. |
| **Dashboard** (`src/modules/dashboard/`) | The extension's options page — Feed Health stats, Selector Health panel (with per-selector "Heal"), data export, and data-cleanse controls. |
| **Evals page** (`src/modules/evals/`) | Runs the detector(s) over labelled posts and reports accuracy/cost — used for tuning. |
| **Shared** (`src/shared/`) | Types, `chrome.storage.local` schema + queue, the LLM client, and eval/cost helpers. |
| **Skills & tools** (`src/skills/library/`, `src/tools/library/`) | Detection and exclusion logic as self-contained, individually-tested units. A codegen step (`npm run generate-skill-registry`) wires them into the runtime registry. |

**Storage:** `chrome.storage.local` only — flagged accounts (capped queue), stored post
snapshots (for export/eval), the selector registry, settings, and the optional API key.

**Permissions** (from `manifest.json`): `storage`, `activeTab`; host access to
`https://www.linkedin.com/*` and `https://api.anthropic.com/*`.

```
src/
├── background/      # service worker (badge, LLM fetch, heal/block relay)
├── content/         # MutationObserver, scoring, CSS hiding, SelectorRegistry
│   └── detector/    # detection orchestration + signal extraction
├── modules/
│   ├── popup/       # toolbar review UI (Preact)
│   ├── dashboard/   # Feed Health + Selector Health options page (Preact)
│   └── evals/       # accuracy/cost eval harness page
├── shared/          # types, storage schema/queue, LLM client, eval helpers
├── skills/library/  # detect-* and exclude-* units (+ AUTHORING.md)
├── tools/library/   # dom-selector-rederive, dom-selector-registry
└── manifest.json    # MV3 manifest
```

**Tech stack:** TypeScript · Preact 10 · Vite 5 + `vite-plugin-web-extension` · Vitest.

---

## Installation

### From source (load unpacked)

> Requires Node.js 18+ and npm.

```bash
# 1. Install dependencies
npm install

# 2. Build the extension (output goes to ./dist)
npm run build
```

Then load it into Chrome:

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked** and select the **`dist/`** folder.
4. Open LinkedIn — the content script runs automatically on `https://www.linkedin.com/*`.

To rebuild on change during development, use `npm run dev` (Vite watch) and hit the reload
icon on the extension card. To produce a distributable zip, run `npm run package`.

### Enabling Claude-powered detection (optional)

The extension works out of the box in **heuristic mode** with no configuration. To upgrade
to Claude detection:

1. Get an API key from the [Anthropic Console](https://console.anthropic.com/).
2. Click the extension's toolbar icon to open the popup.
3. Paste your key into the **API key** field and save.

The key is stored only in `chrome.storage.local` on your machine. With a key present the
content script automatically switches to `LLMDetector`; remove it to fall back to heuristics.
Claude requests count against your own Anthropic account — see
[LLM Cost Reference](#llm-cost-reference) and the dashboard's trace export to monitor spend.

---

## Development

| Command | What it does |
|---------|--------------|
| `npm run build` | Production build to `dist/` (runs the skill-registry codegen first). |
| `npm run dev` | Vite build in watch mode. |
| `npm test` | Run the Vitest suite. |
| `npm run test:watch` | Vitest in watch mode. |
| `npm run type-check` | `tsc --noEmit` type check. |
| `npm run lint` | ESLint over `src`. |
| `npm run check-skill-registry` | Verify the generated skill registry is in sync. |
| `npm run eval` / `eval-label` / `eval-compare` | Detector accuracy/cost evaluation harness. |
| `npm run trace-summary` | Summarise LLM call traces and update the cost table below. |
| `npm run package` | Build and zip the extension for distribution. |

### Contributing notes

- **Never use CSS class names as selectors** — LinkedIn rebuilds them on every deploy. Use
  `data-*`, `aria-*`, `role`, and semantic elements only; put any new selector string in
  `selectors.ts` and read it through the `SelectorRegistry`.
- **Never call `element.remove()`** on feed nodes — it breaks React's virtual DOM. Hide with
  the `.llb-hidden { display: none !important }` class toggle.
- **Never simulate block clicks** — use LinkedIn's `/overlay/report-or-block/` deep link.
- Adding a detection or exclusion unit? See `src/skills/library/AUTHORING.md`, then run
  `npm run generate-skill-registry`.

---

## License

[MIT](LICENSE)
