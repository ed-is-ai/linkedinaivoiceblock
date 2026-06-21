import { SELECTORS_VERSION } from './selectors';
import { startObserving, requestGuardedHeal, liveFeedContainer } from './observer';
import { seedIfNeeded, load } from './selector-registry';
import { seedIfNeeded as skillRegistrySeedIfNeeded, load as skillRegistryLoad, getExclusionSkills } from './skill-registry';
import { HeuristicDetector } from '../skills/library/detect-aiwriting-heuristic/detect-aiwriting-heuristic.skill';
import { LLMDetector } from '../skills/library/detect-aiwriting-llm/detect-aiwriting-llm.skill';
import type { ExclusionResult } from '../shared/types';
import { injectTombstone, injectBlockedTombstone } from './detector/tombstone';
import { expandComments, resetExpansionBudget } from './detector/comment-expand';
import { extractProfileSignals } from './detector/signals/profile';
import { storageGet, storageSet } from '../shared/memory/storage';
import { persistFlaggedAccount } from '../shared/memory/queue';
import { persistStoredPost, persistUnflaggedPost } from '../shared/memory/postStore';
import { AI_LANGUAGE_SIGNALS } from '../shared/llm/signals';
import type { Detector, PostData, ObservedPost, DailyStats } from '../shared/types';
import { detectionConfig } from '../skills/library/detect-aiwriting-heuristic/detectionConfig';
import { TRIGGER_HEAL, HEAL_BUSY } from '../shared/heal-messages';
import type { TriggerHealResponse } from '../shared/heal-messages';

// ---------------------------------------------------------------------------
// Debug flag — set to true locally to log per-post extraction details
// ---------------------------------------------------------------------------

const DEBUG = true;

// ---------------------------------------------------------------------------
// Profile signal cache — module scope so it persists across SPA navigations
// until explicitly cleared (D-10, 03-CONTEXT.md)
// ---------------------------------------------------------------------------

const profileSignalCache = new Map<string, Record<string, number>>();

// ---------------------------------------------------------------------------
// Hidden post nodes — tracks DOM nodes hidden per author so they can be
// unhidden when that author is dismissed (D-07, 05-CONTEXT.md)
// ---------------------------------------------------------------------------

const hiddenPostNodes = new Map<string, Element[]>();

// ---------------------------------------------------------------------------
// Dismissed set — hoisted to module scope so the chrome.storage.onChanged
// listener (registered at module top level) shares the same Set reference
// ---------------------------------------------------------------------------

const dismissedSet = new Set<string>();

// ---------------------------------------------------------------------------
// Blocked authors — populated at init and updated via onChanged
// ---------------------------------------------------------------------------

const blockedAuthors = new Map<string, { postScore: number; profileScore: number }>();

// ---------------------------------------------------------------------------
// Threshold authors — pending accounts whose stored peakScore already meets
// the auto-hide threshold from prior sessions. Populated at init() and rebuilt
// by chrome.storage.onChanged when the settings threshold changes (BUG-01).
// Only 'pending' accounts; blocked accounts are handled by blockedAuthors.
// ---------------------------------------------------------------------------

const thresholdAuthors = new Map<string, number>();

const PROFILE_SIGNAL_KEYS = new Set(['headline-formula', 'degree-3']);
function calcProfileScore(signals: Record<string, number>): number {
  return Object.entries(signals)
    .filter(([k]) => PROFILE_SIGNAL_KEYS.has(k))
    .reduce((sum, [, v]) => sum + v, 0);
}

// ---------------------------------------------------------------------------
// Current threshold — module-scope mirror of settings.autoHideThreshold so the
// onChanged rebuild branch (Task 3) can update it without re-reading storage.
// Default matches settings?.autoHideThreshold ?? 60 used in init().
// ---------------------------------------------------------------------------

let currentThreshold: number = detectionConfig.thresholds.autoHideDefault;

// ---------------------------------------------------------------------------
// Daily stats counters — these are PENDING DELTAS (counts not yet flushed to
// storage), NOT per-day cumulative totals. writeDailyStats() adds them to the
// stored day entry and resets them to zero, so the persisted dailyStats[date]
// accumulates monotonically across SPA navigations and across both the
// seen-only and hide paths. They must NOT be reset on SPA navigation, or seen
// posts browsed before a navigation would be silently dropped (BUG: this caused
// recent days to render as 0% on the feed-health chart).
// ---------------------------------------------------------------------------
let pendingSeen = 0;
let pendingHidden = 0;
let aiSignalsToday = 0;
let botSignalsToday = 0;
const pendingSeenProfileIds = new Set<string>();

// ---------------------------------------------------------------------------
// CSS injection — runs once at script startup
// ---------------------------------------------------------------------------

if (!document.getElementById('llb-styles')) {
  const style = document.createElement('style');
  style.id = 'llb-styles';
  style.textContent = [
    '.llb-hidden { display: none !important; }',
    '.llb-tombstone {',
    '  padding: 8px 16px;',
    '  background: #f3f2ef;',
    '  border: 1px solid #e0e0e0;',
    '  border-radius: 4px;',
    '  color: #666;',
    '  font-size: 14px;',
    '  cursor: default;',
    '  margin: 4px 0;',
    '}',
    '.llb-tombstone--blocked {',
    '  background: #fff1f2;',
    '  border-color: #fca5a5;',
    '  color: #b91c1c;',
    '}',
    '.llb-tombstone__reveal {',
    '  padding: 2px 8px;',
    '  font: inherit;',
    '  font-size: 11px;',
    '  background: transparent;',
    '  border: 1px solid #c7c2bb;',
    '  border-radius: 4px;',
    '  color: #555;',
    '  cursor: pointer;',
    '}',
    '.llb-tombstone__reveal:hover { background: #e8e8e8; }',
    '.llb-tombstone--blocked .llb-tombstone__reveal {',
    '  border-color: #fca5a5;',
    '  color: #b91c1c;',
    '}',
    '.llb-tombstone--blocked .llb-tombstone__reveal:hover { background: #fee2e2; }',
  ].join('\n');
  document.head.appendChild(style);
}

console.log('[LLB] content script starting on', location.href, 'selectors v', SELECTORS_VERSION);

// ---------------------------------------------------------------------------
// Storage change listener — registered at module top level so it catches
// changes regardless of when init() resolves (D-06, 05-CONTEXT.md)
// ---------------------------------------------------------------------------

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;

  // Handle dismissals — unhide tracked nodes for newly dismissed authors
  if (changes['dismissedAccounts']) {
    const newIds: string[] = (changes['dismissedAccounts'].newValue as string[]) ?? [];
    const oldIds: string[] = (changes['dismissedAccounts'].oldValue as string[]) ?? [];
    const freshlyDismissed = newIds.filter(id => !oldIds.includes(id));
    for (const id of freshlyDismissed) {
      dismissedSet.add(id);
      const nodes = hiddenPostNodes.get(id) ?? [];
      for (const node of nodes) {
        node.classList.remove('llb-hidden');
      }
      hiddenPostNodes.delete(id);
    }
  }

  // Handle blocks — apply blocked tombstone to tracked nodes for newly blocked authors
  if (changes['flaggedAccounts']) {
    const newAccounts = (changes['flaggedAccounts'].newValue ?? {}) as Record<string, { status: string; authorName?: string; peakScore?: number; signals?: Record<string, number> }>;
    const oldAccounts = (changes['flaggedAccounts'].oldValue ?? {}) as Record<string, { status: string }>;
    for (const [id, entry] of Object.entries(newAccounts)) {
      if (entry.status === 'blocked' && oldAccounts[id]?.status !== 'blocked') {
        const scores = {
          postScore: entry.peakScore ?? 0,
          profileScore: calcProfileScore(entry.signals ?? {}),
        };
        blockedAuthors.set(id, scores);
        const nodes = hiddenPostNodes.get(id) ?? [];
        for (const node of nodes) {
          node.classList.remove('llb-hidden');
          node.classList.add('llb-hidden'); // keep hidden
          const oldTombstone = node.previousElementSibling;
          if (oldTombstone?.classList.contains('llb-tombstone')) oldTombstone.remove();
          injectBlockedTombstone(node, entry.authorName ?? id, scores.postScore, scores.profileScore);
        }
      }
    }
  }

  // Handle settings change — rebuild thresholdAuthors against the new threshold so that
  // moving the slider takes effect on the next scrolled-in post without a page reload
  if (changes['settings']) {
    const newThreshold = (changes['settings'].newValue as { autoHideThreshold?: number } | undefined)?.autoHideThreshold ?? detectionConfig.thresholds.autoHideDefault;
    currentThreshold = newThreshold;
    storageGet(['flaggedAccounts']).then(({ flaggedAccounts = {} }) => {
      thresholdAuthors.clear();
      for (const [id, entry] of Object.entries(flaggedAccounts)) {
        if (entry.status === 'pending' && entry.peakScore >= newThreshold) {
          thresholdAuthors.set(id, entry.peakScore);
        }
      }
    }).catch(() => {});
  }
});

// ---------------------------------------------------------------------------
// TRIGGER_HEAL message listener — registered at module top level so it is ready
// as soon as the content script loads, regardless of when init() resolves.
//
// Security (T-34-06): Only the TRIGGER_HEAL type is handled; all other message types
// return false immediately (no sendResponse, no side effects).
// Security (T-34-07): Never calls insertCandidate/validateCandidate directly — the
// write gate lives entirely inside the heal pipeline behind requestGuardedHeal.
// Security (T-34-08): Shares the single-flight/cool-off guard via requestGuardedHeal;
// a busy guard responds with { error: HEAL_BUSY }, not { result: [] }.
// Security (T-34-09): liveFeedContainer() re-resolved fresh at receive time; null → { error }.
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener(
  (message: unknown, _sender, sendResponse: (r: TriggerHealResponse) => void): boolean => {
    if ((message as { type?: unknown } | null)?.type !== TRIGGER_HEAL) {
      return false; // unrecognized message type — ignore
    }

    // Resolve the LIVE feed container fresh — never a captured reference (D-09)
    const container = liveFeedContainer();
    if (!container) {
      sendResponse({ error: 'no live feed container' });
      return true;
    }

    // manual = true: dashboard-initiated heal bypasses the 5-min content-side cool-off
    // so one click can attempt ALL stale targets (single-flight latch still applies).
    requestGuardedHeal(container, true)
      .then((outcomes) => {
        if (outcomes === null) {
          // Guard busy (single-flight latch held) — respond with the pinned sentinel (D-08)
          sendResponse({ error: HEAL_BUSY });
        } else {
          sendResponse({ result: outcomes });
        }
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        sendResponse({ error: msg });
      });

    return true; // keep channel open for async response
  }
);

// ---------------------------------------------------------------------------
// writeDailyStats — flush today's counters to storage; prune entries > 30 days
// ---------------------------------------------------------------------------

async function writeDailyStats(): Promise<void> {
  // Snapshot and clear the pending deltas first, so any increments that arrive
  // while the async storage round-trip is in flight are not double-counted.
  const dSeen = pendingSeen;
  const dHidden = pendingHidden;
  const dProfileIds = Array.from(pendingSeenProfileIds);
  if (dSeen === 0 && dHidden === 0 && dProfileIds.length === 0) return;
  pendingSeen = 0;
  pendingHidden = 0;
  pendingSeenProfileIds.clear();

  const today = new Date().toISOString().slice(0, 10);
  const { dailyStats = [] } = await storageGet(['dailyStats']);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const filtered = (dailyStats as DailyStats[]).filter(d => d.date >= cutoffStr);
  const idx = filtered.findIndex(d => d.date === today);
  if (idx >= 0) {
    // ADD the deltas to the stored day entry — never overwrite. This keeps the
    // day's seen/hidden monotonically accumulating across SPA navigations and
    // across both the seen-only and hide code paths.
    const prev = filtered[idx]!;
    const merged = Array.from(new Set([...(prev.seenProfileIds ?? []), ...dProfileIds]));
    filtered[idx] = {
      date: today,
      seen: prev.seen + dSeen,
      hidden: prev.hidden + dHidden,
      seenProfileIds: merged,
    };
  } else {
    filtered.push({ date: today, seen: dSeen, hidden: dHidden, seenProfileIds: dProfileIds });
  }
  await storageSet({ dailyStats: filtered });
}

// Debounced flush — coalesces frequent seen-path increments into one storage
// write rather than persisting on every observed post. Flushed eagerly on
// page hide / unload so an in-flight segment is not lost.
let flushTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleDailyStatsFlush(): void {
  if (flushTimer !== null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    writeDailyStats().catch(() => {});
  }, 2000);
}

// ---------------------------------------------------------------------------
// Async init — reads API key + dismissedAccounts, picks detector, starts observation
// ---------------------------------------------------------------------------

async function init(): Promise<void> {
  const { anthropicApiKey, dismissedAccounts = [], flaggedAccounts = {}, settings } =
    await storageGet(['anthropicApiKey', 'dismissedAccounts', 'flaggedAccounts', 'settings']);

  // Warm the selector registry cache before starting observation
  await seedIfNeeded();
  await load();
  // Warm the skill registry cache before starting observation (SKILL-02)
  await skillRegistrySeedIfNeeded();
  await skillRegistryLoad();

  const autoHideThreshold = settings?.autoHideThreshold ?? detectionConfig.thresholds.autoHideDefault;
  const captureUnflaggedPosts = settings?.captureUnflaggedPosts ?? false;
  currentThreshold = autoHideThreshold;
  for (const id of dismissedAccounts) dismissedSet.add(id);
  for (const [id, entry] of Object.entries(flaggedAccounts)) {
    if (entry.status === 'blocked') {
      blockedAuthors.set(id, {
        postScore: entry.peakScore,
        profileScore: calcProfileScore(entry.signals),
      });
    } else if (entry.status === 'pending' && entry.peakScore >= autoHideThreshold) {
      thresholdAuthors.set(id, entry.peakScore);
    }
  }

  let currentPostNode: Element | null = null;

  const heuristic = new HeuristicDetector({
    fetchComments: async (_post: PostData) =>
      currentPostNode ? expandComments(currentPostNode) : [],
  });

  const detector: Detector = anthropicApiKey
    ? new LLMDetector(heuristic)
    : heuristic;

  console.log('[LLB] detector:', detector.name, anthropicApiKey ? '(LLM mode)' : '(heuristic mode)');

  // SPA navigation reset — clears comment-expansion budget, profile signal cache, and hidden post nodes (D-08).
  // Daily stats deltas are FLUSHED (not discarded) so seen/hidden accumulated in this
  // navigation segment are persisted before the page state changes.
  globalThis.addEventListener('popstate', () => {
    writeDailyStats().catch(() => {});
    resetExpansionBudget();
    profileSignalCache.clear();
    hiddenPostNodes.clear();
    aiSignalsToday = 0;
    botSignalsToday = 0;
  });
  const _originalPushState = history.pushState.bind(history);
  history.pushState = function (...args: Parameters<typeof history.pushState>) {
    _originalPushState(...args);
    writeDailyStats().catch(() => {});
    resetExpansionBudget();
    profileSignalCache.clear();
    hiddenPostNodes.clear();
  };

  // Flush pending daily-stats deltas when the page is hidden or unloaded so a
  // browsing segment that ends without a hide event is not lost.
  globalThis.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') writeDailyStats().catch(() => {});
  });
  globalThis.addEventListener('pagehide', () => {
    writeDailyStats().catch(() => {});
  });

  startObserving((observed: ObservedPost) => {
    const { urn, authorId, authorName, authorProfileUrl, postText, postNode } = observed;
    currentPostNode = postNode;

    const postData: PostData = { urn, authorId, authorName, authorProfileUrl, postText };

    // Already-blocked authors: hide immediately, no scoring needed
    const trackKey = authorId || urn;
    if (blockedAuthors.has(trackKey)) {
      const scores = blockedAuthors.get(trackKey)!;
      postNode.classList.add('llb-hidden');
      injectBlockedTombstone(postNode, authorName, scores.postScore, scores.profileScore);
      hiddenPostNodes.set(trackKey, [...(hiddenPostNodes.get(trackKey) ?? []), postNode]);
      return;
    }

    // Dismissed authors — must not be threshold-hidden even if stored peakScore is high
    if (dismissedSet.has(trackKey)) return;

    // Threshold authors — pending accounts whose stored peakScore already meets the
    // auto-hide threshold from prior sessions; hide immediately with grey tombstone,
    // no need to re-run the async detector (D-01: stored peakScore is authoritative)
    if (thresholdAuthors.has(trackKey)) {
      const peakScore = thresholdAuthors.get(trackKey)!;
      postNode.classList.add('llb-hidden');
      injectTombstone(postNode, authorName, peakScore);
      hiddenPostNodes.set(trackKey, [...(hiddenPostNodes.get(trackKey) ?? []), postNode]);
      return;
    }

    // Exclusion runner — iterates ExclusionSkills in priority order, short-circuits on
    // first excluded:true (CLAUDE.md #5: hard exclusions before detection, D-09 parity)
    // Priority: sponsored → company-page → non-english → open-to-work
    let exclusionResult: ExclusionResult = { excluded: false };
    for (const skill of getExclusionSkills()) {
      const r = skill.check(postData, postNode);
      if (r.excluded) { exclusionResult = r; break; }
      if (r.openToWork) exclusionResult = { ...exclusionResult, openToWork: true };
    }
    if (exclusionResult.excluded) return;

    pendingSeen++;
    pendingSeenProfileIds.add(authorId);
    // Flush the seen delta on a debounced timer so feed-health stats accumulate
    // for browsing sessions even when nothing is hidden (previously dailyStats
    // was only ever written inside the `if (hide)` branch).
    scheduleDailyStatsFlush();

    // Read the live module-scope mirror (updated by the settings onChanged handler)
    // rather than the init()-time `autoHideThreshold` constant, so moving the auto-hide
    // slider takes effect on freshly scored posts without a page reload (WR-01).
    const baseThreshold = currentThreshold;
    const effectiveHideThreshold = exclusionResult.openToWork
      ? baseThreshold + detectionConfig.thresholds.openToWorkPenalty
      : baseThreshold;

    // Extract profile signals once per author per session (D-10)
    if (profileSignalCache.has(authorId) === false) {
      profileSignalCache.set(authorId, extractProfileSignals(postNode));
    }
    const profileSignals = profileSignalCache.get(authorId)!;

    detector.detect(postData).then(async (result) => {
      // Merge profile signals into score and breakdown before all threshold checks
      const profileScore = Object.values(profileSignals).reduce((sum, v) => sum + v, 0);
      const mergedScore = result.score + profileScore;
      const mergedBreakdown = { ...result.signalBreakdown, ...profileSignals };

      if (DEBUG) {
        const signals = Object.entries(mergedBreakdown).map(([k, v]) => `${k}:${v}`).join(' ') || '—';
        console.log(`[LLB] ${mergedScore.toString().padStart(3)} | ${result.engineUsed} | ${authorName || '<unknown>'} | ${signals}\n${postText}`);
      }

      if (captureUnflaggedPosts && mergedScore < detectionConfig.thresholds.flag) {
        persistUnflaggedPost({ urn, authorId: authorId || urn, authorName, score: mergedScore, text: postText, engineUsed: result.engineUsed }).catch(() => {});
      }
      if (mergedScore < detectionConfig.thresholds.flag) return;

      // Skip dismissed authors (Phase 5 writes dismissedAccounts; Phase 3 reads defensively)
      if (dismissedSet.has(authorId)) return;

      const hide = mergedScore >= effectiveHideThreshold;

      await persistFlaggedAccount({
        authorId: authorId || urn,
        authorName,
        authorProfileUrl,
        compositeScore: mergedScore,
        signals: mergedBreakdown,
        hiddenPostUrn: hide ? urn : null,
      });

      if (hide) {
        pendingHidden++;
        writeDailyStats().catch(() => {});
        postNode.classList.add('llb-hidden');
        injectTombstone(postNode, authorName, mergedScore);
        hiddenPostNodes.set(trackKey, [
          ...(hiddenPostNodes.get(trackKey) ?? []),
          postNode,
        ]);
        chrome.runtime.sendMessage({ type: 'POST_HIDDEN' }).catch(() => {});
        persistStoredPost({
          urn,
          authorId: authorId || urn,
          authorName,
          score: mergedScore,
          text: postText,
        }).catch(() => {});
      }
    }).catch((err) => {
      console.warn('[LLB] detector failure', err);
    });
  });
}

init();
