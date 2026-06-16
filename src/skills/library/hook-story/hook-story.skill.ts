/**
 * Hook-story opener CodeSkill wrapper.
 * Wraps checkHookStory from ./hook-story — weights are NOT redeclared here (they live in the underlying function).
 */

import { checkHookStory } from '../../../content/detector/signals/hook-story';
import type { CodeSkill } from '../../../shared/skills/types';

export const hookStorySkill: CodeSkill = {
  kind: 'signal',
  flavor: 'code',
  id: 'hook-story',
  inputs: ['text'],
  sync: true,
  run({ postData }) {
    return checkHookStory(postData.postText);
  },
};
