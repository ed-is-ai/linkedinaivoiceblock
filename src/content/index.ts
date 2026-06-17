import { SELECTORS_VERSION } from './selectors';
import { startObserving } from './observer';
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
import { AI_LANGUAGE_SIGNALS } from '../shared/signals';
import type { Detector, PostData, ObservedPost, DailyStats } from '../shared/types';
import { detectionConfig } from '../skills/library/detect-aiwriting-heuristic/detectionConfig';

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
// Daily stats counters — reset on SPA navigation; flushed on hide events
// ---------------------------------------------------------------------------
let seenToday = 0;
let hiddenToday = 0;
let aiSignalsToday = 0;
let botSignalsToday = 0;
const seenProfileIdsToday = new Set<string>();

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
    '  cursor: pointer;',
    '  margin: 4px 0;',
    '}',
    '.llb-tombstone:hover { background: #e8e8e8; }',
    '.llb-tombstone--blocked {',
    '  background: #fff1f2;',
    '  border-color: #fca5a5;',
    '  color: #b91c1c;',
    '  cursor: default;',
    '}',
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
// writeDailyStats — flush today's counters to storage; prune entries > 30 days
// ---------------------------------------------------------------------------

async function writeDailyStats(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const { dailyStats = [] } = await storageGet(['dailyStats']);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const filtered = (dailyStats as DailyStats[]).filter(d => d.date >= cutoffStr);
  const idx = filtered.findIndex(d => d.date === today);
  if (idx >= 0) {
    const existing = filtered[idx]!.seenProfileIds ?? [];
    const merged = Array.from(new Set([...existing, ...seenProfileIdsToday]));
    filtered[idx] = { date: today, seen: seenToday, hidden: hiddenToday, seenProfileIds: merged };
  } else {
    filtered.push({ date: today, seen: seenToday, hidden: hiddenToday, seenProfileIds: Array.from(seenProfileIdsToday) });
  }
  await storageSet({ dailyStats: filtered });
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

  // SPA navigation reset — clears comment-expansion budget, profile signal cache, and hidden post nodes (D-08)
  globalThis.addEventListener('popstate', () => {
    resetExpansionBudget();
    profileSignalCache.clear();
    hiddenPostNodes.clear();
    seenToday = 0;
    hiddenToday = 0;
    aiSignalsToday = 0;
    botSignalsToday = 0;
    seenProfileIdsToday.clear();
  });
  const _originalPushState = history.pushState.bind(history);
  history.pushState = function (...args: Parameters<typeof history.pushState>) {
    _originalPushState(...args);
    resetExpansionBudget();
    profileSignalCache.clear();
    hiddenPostNodes.clear();
    seenToday = 0;
    hiddenToday = 0;
    seenProfileIdsToday.clear();
  };

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

    seenToday++;
    seenProfileIdsToday.add(authorId);

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
        hiddenToday++;
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
