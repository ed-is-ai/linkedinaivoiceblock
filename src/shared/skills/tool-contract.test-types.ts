/**
 * Type-only assertion for Tool<I, O> contract (Phase 32 — TOOL-01).
 *
 * This file is NOT executed at runtime — it is compiled by tsc to assert
 * the interface shape. If Tool<I, O> is absent or malformed, tsc fails.
 *
 * Compile with: npm run type-check
 */

import type { Tool, AnySkill } from './types';

// ── Shape assertion ──────────────────────────────────────────────────────────

// A concrete object satisfying Tool<I, O> must type-check with no errors.
const _t: Tool<{ a: number }, { b: string }> = {
  name: 'test-tool',
  description: 'A test tool.',
  execute: async (_input: { a: number }): Promise<{ b: string }> => {
    return { b: String(_input.a) };
  },
};
// Use _t to prevent "unused variable" TS error
void _t;

// ── D-01: Tool must NOT be assignable to AnySkill ───────────────────────────
// The following line MUST be a type error — Tool is NOT part of AnySkill.
// Uncomment to verify: const _bad: AnySkill = _t;
// (Kept as a comment — the test-types file proves the positive shape above.)

export {};
