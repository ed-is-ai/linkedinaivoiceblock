/**
 * Tests for generated-tool-registry.ts — order-pinning and execute drift-guard.
 *
 * Order-pinning: GENERATED_TOOLS must preserve the exact array order from
 * skill-order.json tools array. Reordering and regenerating must fail this test.
 *
 * Execute drift-guard: every Tool object in GENERATED_TOOLS must have an
 * execute member that is a function. Note: Tool<I,O> has no 'kind' field —
 * assert on execute, not kind.
 */
import { describe, it, expect } from 'vitest';
import { GENERATED_TOOLS } from './generated-tool-registry';

describe('generated-tool-registry order invariants', () => {
  it('GENERATED_TOOLS order matches skill-order.json tools array', () => {
    const expected = ['dom-selector-rederive'];
    expect(GENERATED_TOOLS.map(t => t.name)).toStrictEqual(expected);
  });
});

describe('generated-tool-registry execute drift-guard', () => {
  it('all GENERATED_TOOLS have execute as a function', () => {
    for (const tool of GENERATED_TOOLS) {
      expect(typeof tool.execute).toBe('function');
    }
  });
});
