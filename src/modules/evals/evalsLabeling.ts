/**
 * LinkedIn Blocker — Evals Labeling Helpers
 *
 * Pure handler functions extracted from evals.tsx so they are unit-testable
 * without any component-rendering tooling (D-08, D-09).
 *
 * Static imports let vi.mock('../../shared/memory/postStore') intercept the module at
 * test time; dynamic import() inside a function body defeats vi.mock hoisting.
 *
 * These are the ONLY writers of post labels from the Evals page surface.
 */

import { setPostLabel, bulkSeedLabels } from '../../shared/memory/postStore';

/**
 * Write a ground-truth label for a single post (D-08).
 * Called by AI / Human button onClick handlers in the LabelingSection component.
 * Always overwrites the prior label — this is a deliberate user action.
 *
 * @param urn   LinkedIn post URN — dedup key used by setPostLabel
 * @param label Ground-truth label supplied by the user
 */
export async function labelPost(urn: string, label: 'ai' | 'human'): Promise<void> {
  await setPostLabel(urn, label);
}

/**
 * Bulk-seed labels for all currently unlabeled posts (D-09).
 * Called by the "Bulk: flagged→AI, unflagged→Human" button onClick handler.
 * Storage-layer idempotency in bulkSeedLabels guarantees manual labels survive.
 */
export async function seedLabels(): Promise<void> {
  await bulkSeedLabels();
}

/**
 * Count how many posts in the given array carry a defined label.
 * Pure function — used for the dataset summary line in the UI.
 *
 * @param posts Any array whose elements may have an optional `label` string field
 * @returns     Number of entries where label !== undefined
 */
export function countLabeled(posts: ReadonlyArray<{ label?: string }>): number {
  return posts.filter(p => p.label !== undefined).length;
}
