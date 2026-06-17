/**
 * Heal orchestrator + Core-4 stateless guard tests (ADAPT-09).
 *
 * Strategy: mock the already-unit-tested leaf modules (heuristic re-deriver, LLMRederiver,
 * SelectorRegistry resolve/insertCandidate, storage) so this suite proves the ORCHESTRATION
 * contract — validate-before-write, no-API-when-heuristics-succeed, LLM-only-when-key-present,
 * heal-to-wrong rejection, and that only a sanitized skeleton leaves. validateCandidate and
 * buildDomSkeleton run for real against the jsdom fixtures.
 *
 * Covers: D3 write-gate, D5 heal-to-wrong rejection, D7 guard suppression, D4 skeleton cross-check.
 * Requirements: ADAPT-01, ADAPT-02, ADAPT-03, ADAPT-06, ADAPT-09
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { rederiveMock } = vi.hoisted(() => ({ rederiveMock: vi.fn() }));

vi.mock('../../../content/selector-registry', () => ({
  resolve: vi.fn(),
  insertCandidate: vi.fn(),
}));
vi.mock('./heuristic', () => ({ deriveHeuristicCandidates: vi.fn() }));
vi.mock('./rederiver', () => ({
  // Regular function (not arrow) so `new LLMRederiver()` works; returns the mocked instance.
  LLMRederiver: vi.fn(function () {
    return { rederive: rederiveMock };
  }),
}));
vi.mock('../../../shared/memory/storage', () => ({ storageGet: vi.fn() }));

import { triggerHeal, isFeedUrl, hasFeedContainer } from './heal';
import { deriveHeuristicCandidates } from './heuristic';
import { resolve, insertCandidate } from '../../../content/selector-registry';
import { storageGet } from '../../../shared/memory/storage';

const FIXDIR = path.join(process.cwd(), 'src', 'tools', 'library', 'dom-selector-rederive', '__fixtures__');

function loadFixture(name: string): string {
  return readFileSync(path.join(FIXDIR, `${name}.html`), 'utf8');
}

/** Mount a fixture into the document and return its feed container (or body for non-feed states). */
function mount(name: string): Element {
  document.body.innerHTML = loadFixture(name);
  return (
    document.querySelector('[data-component-type="LazyColumn"]') ?? document.body
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
  // resolve() returns the seed values so the real validator/guards run against fixtures
  vi.mocked(resolve).mockImplementation((target: string) => {
    if (target === 'FEED_CONTAINER') return '[data-component-type="LazyColumn"]';
    if (target === 'FEED_CONTAINER_FALLBACK') return 'main';
    return 'div[componentkey]';
  });
  vi.mocked(deriveHeuristicCandidates).mockReturnValue([]);
  vi.mocked(storageGet).mockResolvedValue({});
  rederiveMock.mockResolvedValue([]);
});

// ── Core-4 stateless guards ──────────────────────────────────────────────────

describe('Core-4 guards — isFeedUrl / hasFeedContainer (D7 suppression)', () => {
  it('isFeedUrl is true on /feed/ and /feed, false elsewhere', () => {
    history.pushState({}, '', '/feed/');
    expect(isFeedUrl()).toBe(true);
    history.pushState({}, '', '/feed');
    expect(isFeedUrl()).toBe(true);
    history.pushState({}, '', '/jobs/');
    expect(isFeedUrl()).toBe(false);
  });

  it('hasFeedContainer is true on a real feed, false on a logged-out wall', () => {
    mount('feed-healthy');
    expect(hasFeedContainer()).toBe(true);

    document.body.innerHTML = loadFixture('feed-loggedout'); // no LazyColumn, no <main>
    expect(hasFeedContainer()).toBe(false);
  });
});

// ── Heuristic pass: validate-before-write, no API call ────────────────────────

describe('triggerHeal — heuristic pass (ADAPT-02, D3 write-gate)', () => {
  it('writes the first validated heuristic candidate via insertCandidate and does NOT call the LLM', async () => {
    const container = mount('feed-broken-classrot');
    vi.mocked(deriveHeuristicCandidates).mockReturnValue([
      { selector: 'div[data-urn]', confidence: 0.2, source: 'heuristic' },
    ]);

    await triggerHeal(container);

    expect(insertCandidate).toHaveBeenCalledTimes(1);
    expect(insertCandidate).toHaveBeenCalledWith('POST_CARD', 'div[data-urn]', 'heuristic');
    expect(rederiveMock).not.toHaveBeenCalled(); // no API call when heuristics succeed
    expect(storageGet).not.toHaveBeenCalled(); // returned before the API-key read
  });

  it('rejects a heuristic candidate that fails validation (heal-to-wrong, D5) and writes nothing', async () => {
    const container = mount('feed-jobcards'); // /jobs/ links — fails the author-link ratio gate
    vi.mocked(deriveHeuristicCandidates).mockReturnValue([
      { selector: 'div[data-job-id]', confidence: 0.2, source: 'heuristic' },
    ]);
    vi.mocked(storageGet).mockResolvedValue({}); // no API key — LLM also skipped

    await triggerHeal(container);

    expect(insertCandidate).not.toHaveBeenCalled();
  });
});

// ── LLM fallback ──────────────────────────────────────────────────────────────

describe('triggerHeal — LLM fallback (ADAPT-03)', () => {
  it('calls the LLM only when heuristics yield nothing AND an API key is configured, then writes the validated candidate', async () => {
    const container = mount('feed-broken-classrot');
    vi.mocked(deriveHeuristicCandidates).mockReturnValue([]); // no heuristic candidate
    vi.mocked(storageGet).mockResolvedValue({ anthropicApiKey: 'sk-ant-test' });
    rederiveMock.mockResolvedValue([{ selector: 'div[data-urn]', rationale: 'data-urn cards' }]);

    await triggerHeal(container);

    expect(rederiveMock).toHaveBeenCalledTimes(1);
    expect(rederiveMock.mock.calls[0]![0]).toBe('POST_CARD');
    expect(typeof rederiveMock.mock.calls[0]![1]).toBe('string'); // sanitized skeleton
    expect(insertCandidate).toHaveBeenCalledWith('POST_CARD', 'div[data-urn]', 'llm');
  });

  it('does NOT call the LLM when no API key is configured', async () => {
    const container = mount('feed-broken-classrot');
    vi.mocked(deriveHeuristicCandidates).mockReturnValue([]);
    vi.mocked(storageGet).mockResolvedValue({}); // no key

    await triggerHeal(container);

    expect(rederiveMock).not.toHaveBeenCalled();
    expect(insertCandidate).not.toHaveBeenCalled();
  });

  it('rejects an LLM candidate that fails validation and writes nothing', async () => {
    const container = mount('feed-jobcards');
    vi.mocked(deriveHeuristicCandidates).mockReturnValue([]);
    vi.mocked(storageGet).mockResolvedValue({ anthropicApiKey: 'sk-ant-test' });
    rederiveMock.mockResolvedValue([{ selector: 'div[data-job-id]', rationale: 'guess' }]);

    await triggerHeal(container);

    expect(rederiveMock).toHaveBeenCalledTimes(1);
    expect(insertCandidate).not.toHaveBeenCalled();
  });
});

// ── ADAPT-04/06: only a PII-stripped skeleton leaves the page ────────────────

describe('triggerHeal — sanitized skeleton (D4 cross-check)', () => {
  it('sends the LLM only the sanitized skeleton — no names, hrefs, srcs, or aria-labels', async () => {
    const container = mount('feed-pii-rich');
    vi.mocked(deriveHeuristicCandidates).mockReturnValue([]);
    vi.mocked(storageGet).mockResolvedValue({ anthropicApiKey: 'sk-ant-test' });
    rederiveMock.mockResolvedValue([]); // candidates irrelevant — we inspect the outgoing skeleton

    await triggerHeal(container);

    expect(rederiveMock).toHaveBeenCalledTimes(1);
    const skeleton = rederiveMock.mock.calls[0]![1] as string;
    // PII that MUST have been stripped by buildDomSkeleton
    expect(skeleton).not.toContain('licdn');
    expect(skeleton).not.toContain('john-doe');
    expect(skeleton).not.toContain('John Doe');
    expect(skeleton).not.toContain('example.com');
    expect(skeleton).not.toContain('/in/');
    expect(skeleton).not.toContain('Boston');
    // Structure that SHOULD survive
    expect(skeleton).toContain('data-urn');
  });
});
