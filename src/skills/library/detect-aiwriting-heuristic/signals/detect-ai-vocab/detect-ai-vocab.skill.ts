/**
 * AI-vocabulary density CodeSkill wrapper.
 * Wraps checkAiVocab from ./ai-vocab — weights are NOT redeclared here (they live in the underlying function).
 */

import { checkAiVocab } from './ai-vocab';
import type { CodeSkill } from '../../../../../shared/skills/types';

export const aiVocabSkill: CodeSkill = {
  kind: 'signal',
  flavor: 'code',
  id: 'ai-vocab',
  inputs: ['text'],
  sync: true,
  run({ postData }) {
    return checkAiVocab(postData.postText);
  },
};
