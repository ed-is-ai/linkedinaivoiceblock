/**
 * Generic-comments async CodeSkill wrapper.
 * Wraps checkGenericComments from ./comments — this is the ONLY sync:false skill.
 * The score > 20 gate is NOT here — it is enforced by the runner (Landmine 3 + 5).
 * Weights are NOT redeclared here (they live in the underlying function).
 */

import { checkGenericComments } from '../../content/detector/signals/comments';
import type { CodeSkill } from '../../shared/skills/types';

export const genericCommentsSkill: CodeSkill = {
  kind: 'signal',
  flavor: 'code',
  id: 'generic-comments',
  inputs: ['comments'],
  sync: false,
  async run({ postData, fetchComments }) {
    if (!fetchComments) return 0;
    const comments = await fetchComments(postData);
    return checkGenericComments(comments);
  },
};
