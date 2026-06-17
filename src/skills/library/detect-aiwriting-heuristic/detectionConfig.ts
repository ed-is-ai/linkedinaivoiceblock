/**
 * LinkedIn Blocker — Detection Configuration (host-agnostic)
 *
 * Single source of truth for all detection thresholds and heuristic weights.
 * Both the runtime (content script: src/content/index.ts, src/content/detector/heuristic.ts)
 * and the eval CLI (scripts/eval.ts) import their threshold/weight values from this module —
 * neither may hard-code a threshold or weight literal so they can never drift apart.
 *
 * HOST-AGNOSTIC CONTRACT: This file MUST NOT import `fs`, `process`, `chrome.*`,
 * or any DOM API. It is a pure compile-time literal object — zero runtime imports.
 * The content script (chrome extension context) and the eval CLI (Node.js context)
 * both consume this module unchanged.
 *
 * Used by:
 *   - src/content/index.ts               (runtime — flag/openToWorkPenalty/autoHideDefault)
 *   - src/content/detector/heuristic.ts  (runtime — listicle-cta weights + genericComments gate)
 *   - scripts/eval.ts                    (eval CLI — operating-point flag threshold, no-drift tie-in)
 *   - src/content/index.ts Phase 31      (will read maxPostsPerSession for Cost Guardrail)
 */

// ---------------------------------------------------------------------------
// Detection configuration — single source of truth (D-04 / D-05)
// ---------------------------------------------------------------------------

/**
 * Canonical detection constants consumed by the runtime (content script) and the
 * eval CLI (scripts/eval.ts). Neither may hard-code a threshold or weight literal —
 * they MUST import from this module so they can never drift apart.
 *
 * Phase 29 constraint: zero behavior change. All values replicate existing literals
 * exactly. Tuning is Phase 32/33.
 */
export const detectionConfig = {
  thresholds: {
    flag: 35,               // src/content/index.ts L26 — FLAG_THRESHOLD
    openToWorkPenalty: 20,  // src/content/index.ts L27 — OPEN_TO_WORK_PENALTY
    autoHideDefault: 60,    // src/content/index.ts L78, L170, L217 — ?? 60 fallbacks (D-02)
  },
  weights: {
    listicleCta: {          // (D-05) semantic tier keys preserve encoded meaning
      both: 25,             // heuristic.ts L85 — both listicle + CTA present
      listicleOnly: 12,     // heuristic.ts L89 — listicle only
      ctaOnly: 8,           // heuristic.ts L92 — CTA only
    },
    buzzword: { max: 15 },         // heuristic.ts L98 — checkBuzzwords cap (D-04)
    emDash: { max: 10 },           // heuristic.ts L103 — checkEmDash cap (D-04)
    aiVocab: { max: 12 },          // heuristic.ts L113 — checkAiVocab cap (D-04)
    hookStory: { max: 20 },        // heuristic.ts L121 — checkHookStory cap (D-04)
    motivational: { max: 20 },     // heuristic.ts L127 — checkMotivational cap (D-04)
    impersonal: { max: 15 },       // heuristic.ts L134 — checkImpersonalVoice cap (D-04)
    genericComments: {
      gate: 20,             // heuristic.ts L144 — content score > 20 gate (D-04)
      max: 15,              // heuristic.ts L58 comment — "up to 15 pts" (D-04)
    },
  },
  maxPostsPerSession: 50,   // seeded now for Phase 31 (Cost Guardrail); not yet consumed
} as const;
