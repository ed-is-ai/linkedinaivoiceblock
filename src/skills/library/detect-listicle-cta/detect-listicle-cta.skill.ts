/**
 * Listicle-CTA composite CodeSkill wrapper.
 * Single composite skill calling both checkListicle and checkCta — MUST NOT be split into two skills.
 * Weight tier is read from detectionConfig.weights.listicleCta — NOT redeclared here (D-05, Landmine 1).
 */

import { checkListicle } from './listicle';
import { checkCta } from './cta';
import { detectionConfig } from '../../../shared/detectionConfig';
import type { CodeSkill } from '../../../shared/skills/types';

export const listicleCtaSkill: CodeSkill = {
  kind: 'signal',
  flavor: 'code',
  id: 'listicle-cta',
  inputs: ['text'],
  sync: true,
  run({ postData }) {
    const listicleScore = checkListicle(postData.postText);
    const ctaScore = checkCta(postData.postText);
    if (listicleScore > 0 && ctaScore > 0) return detectionConfig.weights.listicleCta.both;
    if (listicleScore > 0) return detectionConfig.weights.listicleCta.listicleOnly;
    if (ctaScore > 0) return detectionConfig.weights.listicleCta.ctaOnly;
    return 0;
  },
};
