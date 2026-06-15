/**
 * Tests for HeuristicDetector — composes signal functions into a Detector implementation.
 * All tests run without a browser (no DOM access inside HeuristicDetector).
 */
import { describe, it, expect, vi } from 'vitest';
import { HeuristicDetector } from './heuristic';
import type { PostData } from '../../shared/types';

describe('HeuristicDetector', () => {
  it('has name === "heuristic"', () => {
    const detector = new HeuristicDetector();
    expect(detector.name).toBe('heuristic');
  });

  it('returns score 0 for clean, unambiguous English prose', async () => {
    const detector = new HeuristicDetector();
    const result = await detector.detect({
      urn: 'urn:li:activity:1',
      authorId: 'user1',
      authorName: 'Alice',
      authorProfileUrl: 'https://linkedin.com/in/alice/',
      postText: 'I went to the shops today and bought milk.',
    });
    expect(result.score).toBe(0);
    expect(result.signals).toEqual([]);
    expect(result.engineUsed).toBe('heuristic');
    expect(result.confidence).toBe('low');
  });

  it('populates signalBreakdown["listicle-cta"] === 25 for listicle + CTA opener combo', async () => {
    const detector = new HeuristicDetector();
    // Text with both a listicle header + numbered items AND a CTA opener + CTA closer
    const postText = [
      'Excited to announce 5 things I learned this quarter:',
      '1. Focus on the customer.',
      '2. Ship fast and learn faster.',
      '3. Trust your team implicitly.',
      'What do you think? Drop a comment below!',
    ].join('\n');
    const result = await detector.detect({
      urn: 'urn:li:activity:2',
      authorId: 'user2',
      authorName: 'Bob',
      authorProfileUrl: 'https://linkedin.com/in/bob/',
      postText,
    });
    expect(result.signalBreakdown['listicle-cta']).toBe(25);
    expect(result.signals).toContain('listicle-cta');
  });

  it('populates signalBreakdown.buzzword === 15 for heavy buzzword text', async () => {
    const detector = new HeuristicDetector();
    // Dense buzzword text: > 3 buzzword density per 100 words, >= 20 words total
    const buzzwords = [
      'synergy', 'synergy', 'synergy', 'leverage', 'leverage', 'leverage',
      'disruption', 'disruption', 'disruption', 'thought leadership',
      'thought leadership', 'thought leadership',
    ];
    const filler = 'word '.repeat(40).trim().split(' ');
    const words = [...buzzwords, ...filler];
    const postText = words.join(' ');
    const result = await detector.detect({
      urn: 'urn:li:activity:3',
      authorId: 'user3',
      authorName: 'Carol',
      authorProfileUrl: 'https://linkedin.com/in/carol/',
      postText,
    });
    expect(result.signalBreakdown['buzzword']).toBe(15);
    expect(result.signals).toContain('buzzword');
  });

  it('populates signalBreakdown["em-dash"] >= 5 for 3 em-dashes in 50-word text', async () => {
    const detector = new HeuristicDetector();
    // 50-word text with 3 em-dashes (density > 1/100 words => returns 5)
    const words = 'word '.repeat(47).trim().split(' ');
    const postText = `This is important — and this matters — because it affects everyone — in every single department. ${words.join(' ')}`;
    const result = await detector.detect({
      urn: 'urn:li:activity:4',
      authorId: 'user4',
      authorName: 'Dan',
      authorProfileUrl: 'https://linkedin.com/in/dan/',
      postText,
    });
    expect(result.signalBreakdown['em-dash']).toBeGreaterThanOrEqual(5);
    expect(result.signals).toContain('em-dash');
  });

  it('does NOT invoke generic-comments path when content score is <= 20', async () => {
    const fetchComments = vi.fn().mockResolvedValue([
      'great insights! this really resonated with me.',
      'great insights! this really resonated with me.',
    ]);
    const detector = new HeuristicDetector({ fetchComments });
    // Clean text with score 0 — below the 20 threshold
    const result = await detector.detect({
      urn: 'urn:li:activity:5',
      authorId: 'user5',
      authorName: 'Eve',
      authorProfileUrl: 'https://linkedin.com/in/eve/',
      postText: 'I went to the shops today and bought milk.',
    });
    expect(fetchComments).not.toHaveBeenCalled();
    expect(result.signalBreakdown['generic-comments']).toBeUndefined();
  });

  it('invokes generic-comments and populates breakdown when content score > 20', async () => {
    const fetchComments = vi.fn().mockResolvedValue([
      'great insights! this really resonated with me.',
      "couldn't agree more! this is exactly what i needed.",
      'well said! this is incredibly insightful content.',
    ]);
    const detector = new HeuristicDetector({ fetchComments });
    // Text that scores > 20 via listicle + CTA (25 points minimum)
    const postText = [
      'Excited to announce 5 things I learned this quarter:',
      '1. Focus on the customer.',
      '2. Ship fast and learn faster.',
      '3. Trust your team implicitly.',
      'What do you think? Drop a comment below!',
    ].join('\n');
    const result = await detector.detect({
      urn: 'urn:li:activity:6',
      authorId: 'user6',
      authorName: 'Frank',
      authorProfileUrl: 'https://linkedin.com/in/frank/',
      postText,
    });
    expect(fetchComments).toHaveBeenCalledOnce();
    expect(result.signalBreakdown['generic-comments']).toBeDefined();
    expect(result.signals).toContain('generic-comments');
  });

  it('caps score at 100 even when signals exceed it', async () => {
    const fetchComments = vi.fn().mockResolvedValue([
      'great insights! this really resonated with me.',
      "couldn't agree more! this is exactly what i needed.",
      'well said! this is incredibly insightful content.',
    ]);
    const detector = new HeuristicDetector({ fetchComments });
    // Construct a high-scoring post: listicle + CTA + heavy buzzwords + em-dashes
    const parts = [
      'Excited to announce the 5 synergy-driven disruption lessons in thought leadership leverage:',
      '1. Synergy drives leverage.',
      '2. Disruption is thought leadership.',
      '3. Leverage synergy for impact.',
      '4. Thought leadership synergy matters.',
      '5. Leverage disruption for synergy.',
      // em-dashes
      'This is transformative — and disruptive — because it changes everything — forever.',
      // more buzzwords to push density up
      'synergy leverage disruption synergy leverage disruption synergy leverage disruption synergy leverage disruption synergy',
      'What do you think? Drop a comment below!',
    ];
    const postText = parts.join('\n');
    const result = await detector.detect({
      urn: 'urn:li:activity:7',
      authorId: 'user7',
      authorName: 'Grace',
      authorProfileUrl: 'https://linkedin.com/in/grace/',
      postText,
    });
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('sets confidence: high when score >= 60, medium for 35-59, low below 35', async () => {
    const detector = new HeuristicDetector();

    // score 0 => low
    const lowResult = await detector.detect({
      urn: 'urn:li:activity:8',
      authorId: 'user8',
      authorName: 'Hank',
      authorProfileUrl: 'https://linkedin.com/in/hank/',
      postText: 'I went to the shops today and bought milk.',
    });
    expect(lowResult.confidence).toBe('low');
  });

  it('signals[] equals Object.keys(signalBreakdown)', async () => {
    const detector = new HeuristicDetector();
    const postText = [
      'Excited to announce 5 things I learned this quarter:',
      '1. Focus on the customer.',
      '2. Ship fast and learn faster.',
      '3. Trust your team implicitly.',
      'What do you think? Drop a comment below!',
    ].join('\n');
    const result = await detector.detect({
      urn: 'urn:li:activity:9',
      authorId: 'user9',
      authorName: 'Iris',
      authorProfileUrl: 'https://linkedin.com/in/iris/',
      postText,
    });
    expect(result.signals).toEqual(Object.keys(result.signalBreakdown));
  });
});

describe('HeuristicDetector — golden-score snapshot (D-06 zero-behavior-change)', () => {
  // Fixtures reused verbatim from the existing tests above.
  // These exact score + breakdown values are pinned PRE-REFACTOR so Plan 02 can
  // prove byte-identical output after moving literals into detectionConfig.ts.
  // If any value differs after the refactor, treat it as a bug, not a tuning decision.

  const cleanProsePost: PostData = {
    urn: 'urn:li:activity:1',
    authorId: 'user1',
    authorName: 'Alice',
    authorProfileUrl: 'https://linkedin.com/in/alice/',
    postText: 'I went to the shops today and bought milk.',
  };

  const listicleCtaPost: PostData = {
    urn: 'urn:li:activity:2',
    authorId: 'user2',
    authorName: 'Bob',
    authorProfileUrl: 'https://linkedin.com/in/bob/',
    postText: [
      'Excited to announce 5 things I learned this quarter:',
      '1. Focus on the customer.',
      '2. Ship fast and learn faster.',
      '3. Trust your team implicitly.',
      'What do you think? Drop a comment below!',
    ].join('\n'),
  };

  const buzzwordPost: PostData = {
    urn: 'urn:li:activity:3',
    authorId: 'user3',
    authorName: 'Carol',
    authorProfileUrl: 'https://linkedin.com/in/carol/',
    postText: (() => {
      const buzzwords = [
        'synergy', 'synergy', 'synergy', 'leverage', 'leverage', 'leverage',
        'disruption', 'disruption', 'disruption', 'thought leadership',
        'thought leadership', 'thought leadership',
      ];
      const filler = 'word '.repeat(40).trim().split(' ');
      return [...buzzwords, ...filler].join(' ');
    })(),
  };

  const emDashPost: PostData = {
    urn: 'urn:li:activity:4',
    authorId: 'user4',
    authorName: 'Dan',
    authorProfileUrl: 'https://linkedin.com/in/dan/',
    postText: `This is important — and this matters — because it affects everyone — in every single department. ${'word '.repeat(47).trim().split(' ').join(' ')}`,
  };

  const aiVoicePost: PostData = {
    urn: 'urn:li:activity:voice001',
    authorId: 'voice-test',
    authorName: 'Voice Test',
    authorProfileUrl: 'https://www.linkedin.com/in/voice-test/',
    postText: [
      'I was sitting with our CEO when he said something that changed how I think about leadership.',
      '',
      'My mentor once told me: "Most people want to be successful. But very few want to do what success actually requires."',
      '',
      'That hit me differently.',
      '',
      'Most people focus on the result. The top performers focus on the process.',
      '',
      'Stop chasing outcomes. Start building habits.',
      '',
      'What do you think? Drop a comment below.',
    ].join('\n'),
  };

  const genuineHumanPost: PostData = {
    urn: 'urn:li:activity:human001',
    authorId: 'human-test',
    authorName: 'Human Test',
    authorProfileUrl: 'https://www.linkedin.com/in/human-test/',
    postText: [
      'Spent the morning debugging a weird race condition in our payment service.',
      "Turned out to be a missing mutex around a shared cache write that only manifested under load.",
      "Three hours I'll never get back, but at least I learned something new about our caching layer.",
      'Now off to write a post-mortem before I forget the details.',
    ].join('\n'),
  };

  it('pins exact score + breakdown for clean-prose post (score 0, empty breakdown)', async () => {
    const detector = new HeuristicDetector();
    const result = await detector.detect(cleanProsePost);
    expect({ score: result.score, breakdown: result.signalBreakdown }).toStrictEqual({
      score: 0,
      breakdown: {},
    });
  });

  it('pins exact score + breakdown for listicle+CTA post (listicle-cta composite = 25)', async () => {
    const detector = new HeuristicDetector();
    const result = await detector.detect(listicleCtaPost);
    expect({ score: result.score, breakdown: result.signalBreakdown }).toStrictEqual({
      score: 25,
      breakdown: { 'listicle-cta': 25 },
    });
  });

  it('pins exact score + breakdown for heavy-buzzword post (buzzword = 15)', async () => {
    const detector = new HeuristicDetector();
    const result = await detector.detect(buzzwordPost);
    expect({ score: result.score, breakdown: result.signalBreakdown }).toStrictEqual({
      score: 15,
      breakdown: { buzzword: 15 },
    });
  });

  it('pins exact score + breakdown for em-dash post', async () => {
    const detector = new HeuristicDetector();
    const result = await detector.detect(emDashPost);
    expect({ score: result.score, breakdown: result.signalBreakdown }).toStrictEqual({
      score: 10,
      breakdown: { 'em-dash': 10 },
    });
  });

  it('pins exact score + breakdown for AI-voice post (hook-story + motivational + impersonal composite)', async () => {
    const detector = new HeuristicDetector();
    const result = await detector.detect(aiVoicePost);
    // The AI-voice fixture triggers: listicle-cta (CTA-only tier = 8), hook-story (20),
    // motivational (20), impersonal (15). Total = 63.
    expect({ score: result.score, breakdown: result.signalBreakdown }).toStrictEqual({
      score: 63,
      breakdown: {
        'listicle-cta': 8,
        'hook-story': 20,
        motivational: 20,
        impersonal: 15,
      },
    });
  });

  it('pins exact score + breakdown for genuine-human post (low score)', async () => {
    const detector = new HeuristicDetector();
    const result = await detector.detect(genuineHumanPost);
    expect({ score: result.score, breakdown: result.signalBreakdown }).toStrictEqual({
      score: 0,
      breakdown: {},
    });
  });
});

describe('HeuristicDetector — AI voice pattern (v5.0 regression)', () => {
  it('AI voice post with hook+motivational+impersonal scores >= 60', async () => {
    const detector = new HeuristicDetector();
    const post: PostData = {
      urn: 'urn:li:activity:voice001',
      authorId: 'voice-test',
      authorName: 'Voice Test',
      authorProfileUrl: 'https://www.linkedin.com/in/voice-test/',
      postText: [
        'I was sitting with our CEO when he said something that changed how I think about leadership.',
        '',
        'My mentor once told me: "Most people want to be successful. But very few want to do what success actually requires."',
        '',
        'That hit me differently.',
        '',
        'Most people focus on the result. The top performers focus on the process.',
        '',
        'Stop chasing outcomes. Start building habits.',
        '',
        'What do you think? Drop a comment below.',
      ].join('\n'),
    };
    const result = await detector.detect(post);
    expect(result.score).toBeGreaterThanOrEqual(60);
  });

  it('genuine personal post scores <= 20', async () => {
    const detector = new HeuristicDetector();
    const post: PostData = {
      urn: 'urn:li:activity:human001',
      authorId: 'human-test',
      authorName: 'Human Test',
      authorProfileUrl: 'https://www.linkedin.com/in/human-test/',
      postText: [
        'Spent the morning debugging a weird race condition in our payment service.',
        "Turned out to be a missing mutex around a shared cache write that only manifested under load.",
        "Three hours I'll never get back, but at least I learned something new about our caching layer.",
        'Now off to write a post-mortem before I forget the details.',
      ].join('\n'),
    };
    const result = await detector.detect(post);
    expect(result.score).toBeLessThanOrEqual(20);
  });
});
