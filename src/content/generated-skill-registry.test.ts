/**
 * Tests for generated-skill-registry.ts — order-pinning (D-06) and kind-drift-guard (D-07).
 *
 * D-06: GENERATED_SIGNAL_SKILLS and GENERATED_EXCLUSION_SKILLS must preserve the exact
 * array order from Phase 30 CODE_SIGNAL_SKILLS / CODE_EXCLUSION_SKILLS.  Reordering
 * skill-order.json and regenerating the module must fail these tests.
 *
 * D-07: Every skill object in the generated arrays must carry the correct `kind`
 * discriminant at runtime (the codegen validates frontmatter kind at build time; this
 * test is the second, runtime layer of the same guard).
 */
import { describe, it, expect } from 'vitest';
import {
  GENERATED_SIGNAL_SKILLS,
  GENERATED_EXCLUSION_SKILLS,
} from './generated-skill-registry';

describe('generated-skill-registry order invariants (D-06)', () => {
  it('GENERATED_SIGNAL_SKILLS order matches Phase 30 CODE_SIGNAL_SKILLS order', () => {
    const expected = [
      'listicle-cta',
      'buzzword',
      'em-dash',
      'ai-vocab',
      'hook-story',
      'motivational',
      'impersonal',
      'generic-comments',
    ];
    expect(GENERATED_SIGNAL_SKILLS.map(s => s.id)).toStrictEqual(expected);
  });

  it('GENERATED_EXCLUSION_SKILLS order matches Phase 30 CODE_EXCLUSION_SKILLS order', () => {
    const expected = ['sponsored', 'company-page', 'non-english', 'open-to-work'];
    expect(GENERATED_EXCLUSION_SKILLS.map(s => s.id)).toStrictEqual(expected);
  });
});

describe('generated-skill-registry kind drift-guard (D-07)', () => {
  it('all GENERATED_SIGNAL_SKILLS have kind === signal', () => {
    for (const skill of GENERATED_SIGNAL_SKILLS) {
      expect(skill.kind).toBe('signal');
    }
  });

  it('all GENERATED_EXCLUSION_SKILLS have kind === exclusion', () => {
    for (const skill of GENERATED_EXCLUSION_SKILLS) {
      expect(skill.kind).toBe('exclusion');
    }
  });
});
