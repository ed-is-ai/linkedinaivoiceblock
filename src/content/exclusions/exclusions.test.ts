/**
 * Exclusion parity test — exercises the getExclusionSkills() registry runner path.
 *
 * Proves that iterating getExclusionSkills() with the same short-circuit loop used
 * in content/index.ts produces IDENTICAL ExclusionResults to the legacy checkExclusions()
 * for a representative fixture set (D-09 / SKILL-03 / SKILL-04).
 *
 * This test exercises the NEW runner path — it does NOT call checkExclusions() directly.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getExclusionSkills } from '../skill-registry';
import type { PostData, ExclusionResult } from '../../shared/types';

// Mock resolve() and updateCandidate() from selector-registry so JSDOM querySelector
// calls find or miss marker elements deterministically, without needing real chrome.storage.
vi.mock('../selector-registry', () => ({
  resolve: vi.fn((target: string) => {
    // Return simple attribute selectors that JSDOM can match
    if (target === 'SPONSORED_MARKER') return '[data-test-sponsored]';
    if (target === 'COMPANY_PAGE_MARKER') return '/company/';
    if (target === 'OPEN_TO_WORK_MARKER') return '[data-test-open-to-work]';
    return `[data-unknown-${target.toLowerCase()}]`;
  }),
  // Fire-and-forget telemetry — must be present in the mock so skills can call it
  updateCandidate: vi.fn(() => Promise.resolve()),
}));

/**
 * Run the same short-circuit loop that content/index.ts uses.
 * This is the runner under test (D-09 parity).
 */
function runExclusionRunner(postData: PostData, postNode: Element): ExclusionResult {
  let result: ExclusionResult = { excluded: false };
  for (const skill of getExclusionSkills()) {
    const r = skill.check(postData, postNode);
    if (r.excluded) { result = r; break; }
    if (r.openToWork) result = { ...result, openToWork: true };
  }
  return result;
}

/** Base post data fixture — English, no special markers */
const basePostData: PostData = {
  urn: 'urn:li:activity:test001',
  authorId: 'test-author',
  authorName: 'Test Author',
  authorProfileUrl: 'https://www.linkedin.com/in/test-author/',
  postText: 'I spent the morning working on a new project and learned something interesting.',
};

describe('Exclusion runner parity — getExclusionSkills() short-circuit loop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Fixture 1: postNode with SPONSORED_MARKER child → { excluded: true, reason: "sponsored" }', () => {
    const postNode = document.createElement('div');
    const sponsored = document.createElement('span');
    sponsored.setAttribute('data-test-sponsored', 'true');
    postNode.appendChild(sponsored);

    const result = runExclusionRunner(basePostData, postNode);

    expect(result).toEqual({ excluded: true, reason: 'sponsored' });
  });

  it('Fixture 2: authorProfileUrl containing company-page marker → { excluded: true, reason: "company-page" }', () => {
    const postNode = document.createElement('div');
    const companyPostData: PostData = {
      ...basePostData,
      authorProfileUrl: 'https://www.linkedin.com/company/acme-corp/',
    };

    const result = runExclusionRunner(companyPostData, postNode);

    expect(result).toEqual({ excluded: true, reason: 'company-page' });
  });

  it('Fixture 3: CJK-heavy postText → { excluded: true, reason: "non-english" }', () => {
    const postNode = document.createElement('div');
    // CJK text — more than 10 non-ASCII characters, >30% in non-Latin script ranges
    const cjkPostData: PostData = {
      ...basePostData,
      postText: '今日は会議で新しいプロジェクトについて話し合いました。とても面白い議論でした。最終的には良い結論が出ました。',
    };

    const result = runExclusionRunner(cjkPostData, postNode);

    expect(result).toEqual({ excluded: true, reason: 'non-english' });
  });

  it('Fixture 4: postNode with OPEN_TO_WORK_MARKER child → { excluded: false, openToWork: true }', () => {
    const postNode = document.createElement('div');
    const otw = document.createElement('span');
    otw.setAttribute('data-test-open-to-work', 'true');
    postNode.appendChild(otw);

    const result = runExclusionRunner(basePostData, postNode);

    expect(result).toEqual({ excluded: false, openToWork: true });
  });

  it('Fixture 5: Normal English post with no markers → { excluded: false }', () => {
    const postNode = document.createElement('div');

    const result = runExclusionRunner(basePostData, postNode);

    expect(result).toEqual({ excluded: false });
  });

  it('Priority case: postNode with BOTH sponsored AND open-to-work markers → sponsored short-circuits first', () => {
    const postNode = document.createElement('div');
    // Add both markers to the same node
    const sponsored = document.createElement('span');
    sponsored.setAttribute('data-test-sponsored', 'true');
    postNode.appendChild(sponsored);
    const otw = document.createElement('span');
    otw.setAttribute('data-test-open-to-work', 'true');
    postNode.appendChild(otw);

    const result = runExclusionRunner(basePostData, postNode);

    // Sponsored is Priority 1 — short-circuit fires before open-to-work is reached
    expect(result).toEqual({ excluded: true, reason: 'sponsored' });
    expect(result.openToWork).toBeUndefined();
  });
});
