export const meta = {
  name: 'research-strategy-verifier',
  description: 'Design a better verifier + workflow strategy + research plan that can PROVE (or honestly falsify) the datafetch kb thesis, learning from the Stop-hook verifier that failed this session',
  phases: [
    { title: 'Map', detail: 'decompose thesis into falsifiable claims; postmortem the failed verifier; extract methodology+substrate state' },
    { title: 'Design', detail: '3 independent full-strategy drafts from distinct angles + judge' },
    { title: 'Adversarial', detail: 'skeptics stress-test the winning synthesis for honesty/gameability/falsifiability' },
    { title: 'Synthesize', detail: 'final research-strategy document' },
  ],
};

// ---------------------------------------------------------------------------
// Grounding shared with every agent. The agents cannot see the chat history,
// so the load-bearing context is encoded here. Agents may also Read the cited
// kb/ + experiments/ files for depth.
// ---------------------------------------------------------------------------

const REPO = '/Users/jayfarei/src/tries/2026-05-01-hackathon';

const THESIS = `
THE DATAFETCH THESIS (kb/mission.md, kb/mental-model.md, kb/research.md):
"Datafetch does not virtualize the whole dataset. It virtualizes the dataset
INTERFACE, then improves that interface from accepted, evidence-backed work."
The novel conjunction claimed: (a) typed primitives visible to the agent (Code
Mode surface df.db/df.tool/df.lib), + (b) cross-session interface evolution
GATED by accepted, evidence-backed answers (observe -> gate -> crystallise ->
govern -> persist), + (c) per-tenant overlay so different agents grow different
surfaces. The "cold-to-warm flip" (a novel tier-4 composition becomes a tier-2
learned-interface call, same gold answer, lower cost) is stated as the falsifier.
Positioned vs the EPHEMERAL re-derivation regime that Perplexity "Search as Code"
(kb/br/20) exemplifies (re-derives every session, keeps nothing) — NEVER a literal
SaC head-to-head. The differentiator = a SECOND learning timescale: online,
per-tenant, GOVERNED crystallisation + persistence.`;

const METHODOLOGY = `
METHODOLOGY ALREADY ESTABLISHED (kb/br/19 — the adversarial baseline ladder +
paired-eval methodology; kb/br/16-post-skillcraft + kb/br/16-substrate-benchmark
+ kb/br/17 — corpus selection + shape-probe):
- The HONEST adversarial baseline is NOT "no tools" and NOT "no library". It is
  Arm 1: a TOOL-MATCHED agent that writes its own helper INLINE every question
  with NO persistence. Almost no prior skill-library paper ran this arm.
- 5-arm ladder: (0) no-tools floor; (1) inline-rewrite-no-persistence [the bar];
  (2) datafetch governed library [treatment]; (3) ablation-without-governance;
  (4) frozen-library replay (isolates persistence/amortisation from artifact
  presence); (5 opt) curated/human-skill ceiling.
- KEY PREDICTION from the 2026 literature (SkillsBench -1.8pp self-gen;
  SkillFlow Sonnet-4.6 0.00pp; ReGAL/CRAFT regressions on cheap tasks): a
  frontier-model SINGLE-SESSION CORRECTNESS delta over Arm 1 is ~0 or negative.
  So value MUST be claimed on a separate pre-registered endpoint: (i) amortised
  cost at neutral-or-better correctness, (ii) cross-session persistence-as-
  abstraction (SkillFlow: abstraction 71% vs raw-history 51%), (iii) governance-
  prevented regressions (CoEvoSkills 32%->71% with a verifier; ungoverned skills
  regress via the silent-wrong-answer landmine).
- Stats: paired McNemar (~236 paired Qs for 10pp delta), report realised b,c,b+c;
  rule-based exact-match primary lower bound + judge-augmented upper bound (Cohen
  kappa >=0.80); k>=5 interleaved seeds, pinned dated model snapshot; one
  pre-registered confirmatory endpoint + Benjamini-Hochberg FDR on slices; 6
  confound controls (tool-match, prompt-parity, online-learning-leakage,
  model-drift, train/test-contamination, budget-match). Corpus recommended:
  CRAG (2,706 public Qs) primary + tau-3-bench companion.`;

const SESSION_LEARNINGS = `
WHAT HAPPENED THIS SESSION (the verifier that FAILED — this is the crux to learn
from; full trail in ${REPO}/experiments/episodes/03-sac-poc/RUN-LOG.md Attempts 1-30,
PHASE-1-FINDINGS.md, DEMO.md, figures/cost-frontier.svg):
- A Stop-hook "Goal" was installed as a 3-phase sequential COMPLETION CONTRACT.
  Phase-1's completion condition was a SPECIFIC POSITIVE empirical outcome: arm4
  (frozen cross-session warm reuse) beats BOTH the memoization (arm5a) and recipe
  (arm5b) floors, with a finite break-even M* whose 95% upper CI <= M0=8 sessions,
  claimUpheld=true, over k>=5 seeds on a pinned model.
- The pre-registered confirmatory run (pokeapi-pokedex, k=5, sonnet-4-6, held-out
  NEW-ARGUMENT level h1x) FALSIFIED it: M* = +Infinity (arm4 warm cost > arm1
  inline cost in EVERY token unit — full-weight 235,098 vs 168,577; fresh+output
  3,008 vs 2,911; dollar-equiv 26,217 vs 19,477), and arm4 was LESS correct (h1x
  2/5 vs arm1 4/5), claimUpheld=false. This is EXACTLY br/19's prediction for the
  frontier-model + cheap-to-derive-inline + low-reuse-density regime (~0/negative).
  Diagnosis: the crystallised helper was SHALLOW + effectively non-invocable (no
  write savings), and the +66k gap is a TURN-COUNT tax, not hydration bloat.
- THE VERIFIER FAILURE: the Stop hook then fired INDEFINITELY (15+ cycles)
  demanding the falsified positive, which the intellectual-honesty mandate
  forbade fabricating -> UNSATISFIABLE BY CONSTRUCTION. It made a HYPOTHESIS
  (which can be falsified) the COMPLETION CONDITION.
- INDUCED AGENT FAILURE MODES under the firing verifier: (a) OVER-GATING — the
  agent repeatedly declared genuinely-DOABLE, Goal-mandated substrate work
  "blocked / user-reserved" and was proven wrong 3x after investigation (the
  de-hardcode-src/observer refactor; the df.tool.* manifest branch; the
  zero-src-onboarding proof — each "claimed blocked, then demonstrated doable").
  (b) near OVER-PRODUCTION of redundant proxy tests. The verifier gave NO signal
  to distinguish doable-vs-blocked or non-redundant-vs-redundant, so the agent
  oscillated.
- THE VERIFIER NEVER DISTINGUISHED three kinds of incompleteness, treating all
  identically: IMPOSSIBLE (the falsified positive — cannot fabricate), USER-GATED
  (a corpus choice the Goal itself reserved for the user), and DOABLE-BUT-
  OVER-GATED (substrate work the agent wrongly deferred).
- WHAT HONESTLY GOT PROVEN (all green, typecheck 0 / 432 unit tests / governance
  probes 4/4): substrate made DATASET-NEUTRAL (governance gate generalized off
  numeric-only via an answer-kit equality predicate; dataset-specific code-gen
  relocated behind a registry; df.tool.* manifest rendering added); ZERO-SRC
  dataset onboarding (mechanism, proven by a synthetic-fixture integration test);
  governance gate DECLINES stale/wrong helpers (adversarial probes); CROSS-SESSION
  PERSISTENCE (a helper crystallised in session 1, frozen + reused in a later
  session — real arm4 run data). WHAT IS FALSIFIED: the cost-amortisation headline
  on CHEAP fan-out tasks.
- SURVIVING DIFFERENTIATORS (from a 33-agent thesis-regeneration workflow earlier
  this session): (1) governance-under-staleness; (2) zero-src SDK onboarding
  [highest promise — sidesteps the cost diagnosis entirely]; (3) ONE narrow cost
  island: a DEEP, INVOCABLE helper on SERIAL-DEPENDENCY-DEPTH tasks, measured in
  TURNS not tokens (bounded out of LLM-cored regimes). The cheap-fan-out cost
  regime is a dead lever.`;

const CRUX = `
THE CRUX LEARNING (state it, build on it, and let the adversarial phase attack it):
A completion VERIFIER for a research program must verify PROCESS-VALIDITY +
HONEST-REPORTING — "did a pre-registered, confound-controlled, k>=5 experiment run
and report its realised b,c,b+c / CIs / M* / endpoint honestly?" — NOT a hoped-for
OUTCOME DIRECTION. A pre-registered hypothesis that is HONESTLY FALSIFIED is a
COMPLETE, SUCCESSFUL verification, not an incomplete task. Conflating the hypothesis
with the completion condition makes the verifier unsatisfiable the instant reality
disagrees, and pressures the agent toward fabrication or thrashing.`;

// ---------------------------------------------------------------------------
// PHASE 1 — MAP
// ---------------------------------------------------------------------------
phase('Map');

const CLAIMS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['claims', 'deadLevers'],
  properties: {
    claims: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'statement', 'regimeOfValidity', 'endpoint', 'priorStatus', 'evidence', 'falsificationCriterion'],
        properties: {
          id: { type: 'string' },
          statement: { type: 'string', description: 'the falsifiable claim, one sentence' },
          regimeOfValidity: { type: 'string', description: 'task shape / model tier / reuse density / corpus where this claim could hold' },
          endpoint: { type: 'string', description: 'the measurable endpoint + metric that tests it (cost/persistence/governance/correctness/turns)' },
          priorStatus: { type: 'string', enum: ['proven', 'falsified', 'partial', 'untested'] },
          evidence: { type: 'string', description: 'what this session / br19 already showed' },
          falsificationCriterion: { type: 'string', description: 'the concrete result that would FALSIFY this claim' },
        },
      },
    },
    deadLevers: { type: 'array', items: { type: 'string' }, description: 'claims/regimes already falsified — do NOT re-test these' },
  },
};

const mapPrompts = [
  {
    label: 'map:thesis-claims',
    schema: CLAIMS_SCHEMA,
    prompt: `Decompose the datafetch thesis into a set of INDEPENDENT, FALSIFIABLE claims, each tagged with its regime-of-validity, the endpoint/metric that tests it, its prior status (proven/falsified/partial/untested per this session + br19), and the concrete result that would falsify it.

${THESIS}
${METHODOLOGY}
${SESSION_LEARNINGS}

Read for grounding: ${REPO}/kb/mission.md, ${REPO}/kb/research.md, ${REPO}/kb/br/19-skill-library-baseline-ladder-and-paired-eval-methodology.md, ${REPO}/kb/br/20-perplexity-search-as-code.md, ${REPO}/experiments/episodes/03-sac-poc/PHASE-1-FINDINGS.md.

Be precise about WHERE each claim could hold vs where it is already falsified. The cheap-fan-out cost-amortisation lever is DEAD — list it under deadLevers, do not propose re-testing it. The surviving levers (governance-under-staleness, zero-src SDK onboarding, deep-invocable-helper-on-serial-depth) are where falsifiable claims should concentrate. Return the structured object.`,
  },
  {
    label: 'map:verifier-postmortem',
    prompt: `You are diagnosing why a research-program "verifier" (a Stop-hook completion contract) failed catastrophically, so we can design a better one.

${SESSION_LEARNINGS}
${CRUX}

Read ${REPO}/experiments/episodes/03-sac-poc/RUN-LOG.md (skim Attempts 1, 11, 18-30) for the trail.

Produce a precise POSTMORTEM and a set of DESIGN PRINCIPLES for a better verifier. Cover at minimum:
1. The category error (hypothesis-as-completion-condition) and exactly how it made the contract unsatisfiable.
2. The three kinds of incompleteness it failed to distinguish (impossible / user-gated / doable) and how a better verifier should TYPE each blocker and respond differently.
3. How it induced over-gating AND near-over-production, and what SIGNAL a verifier should give to keep an autonomous agent calibrated between those failure modes.
4. What a verifier SHOULD assert instead (process-validity + honest-reporting + per-claim falsification), and the explicit TERMINAL states it must admit (incl. "honest negative = DONE" and "blocked-on-user = paused-not-failed").
5. A concrete, checkable VERIFIER PREDICATE (pseudocode or a checklist) that would have terminated correctly on this session's honest negative.
Be concrete and critical; this is the most important Phase-1 output.`,
  },
  {
    label: 'map:methodology-and-substrate-state',
    prompt: `Produce a tight, reusable spec of (A) the evaluation methodology we will reuse, and (B) the current substrate state (what is built+proven vs falsified), reconciling br19 with this session's empirical falsification.

${METHODOLOGY}
${SESSION_LEARNINGS}

Read ${REPO}/kb/br/19-skill-library-baseline-ladder-and-paired-eval-methodology.md, ${REPO}/kb/br/16-post-skillcraft-benchmark-selection.md, ${REPO}/kb/br/17-crag-shape-probe-findings.md, ${REPO}/experiments/episodes/03-sac-poc/PHASE-1-FINDINGS.md, ${REPO}/experiments/episodes/03-sac-poc/ONBOARDING.md.

Deliver:
1. The 5-arm ladder + 6 confound controls + paired-McNemar/Wilcoxon stats, condensed to a checklist a runner must satisfy.
2. The REGIME MAP: for each surviving claim regime (governance-under-staleness, zero-src onboarding, deep-helper-serial-depth), which corpus + which endpoint + which arms actually test it, and why the cheap-fan-out regime is excluded.
3. SUBSTRATE READINESS: what the dataset-neutral substrate already provides (answer-kit equality gate, codegen specialization registry, df.tool.* rendering, zero-src onboarding, governance probes) and what is still missing for each surviving claim's experiment (e.g. a deep-invocable-helper corpus; a staleness/drift injector; df.llm.* for LLM-cored cost).
4. Corpus decision inputs: CRAG vs tau-3-bench vs a purpose-built deep-pipeline corpus, mapped to which surviving claim each can prove.`,
  },
];

const mapResults = await parallel(
  mapPrompts.map((p) => () =>
    agent(p.prompt, { label: p.label, phase: 'Map', ...(p.schema ? { schema: p.schema } : {}) }),
  ),
);
const [claimsMap, verifierPostmortem, methodologyState] = mapResults;

const mapDigest = `
=== PHASE-1 MAP OUTPUTS ===

--- THESIS CLAIMS (structured) ---
${JSON.stringify(claimsMap, null, 2)}

--- VERIFIER POSTMORTEM + DESIGN PRINCIPLES ---
${verifierPostmortem ?? '(none)'}

--- METHODOLOGY + SUBSTRATE STATE ---
${methodologyState ?? '(none)'}
`;

// ---------------------------------------------------------------------------
// PHASE 2 — DESIGN (3 independent full-strategy drafts + judge)
// ---------------------------------------------------------------------------
phase('Design');

const designAngles = [
  {
    key: 'honesty-verifier-first',
    angle: `Lead with the VERIFIER redesign. Treat the research strategy as the thing the new verifier MEASURES. The verifier is a process-validity + honest-reporting + per-claim-falsification predicate with explicit terminal states (honest-negative=DONE, blocked-on-user=PAUSED, doable=CONTINUE). Show how the research plan is structured so this verifier can actually run it to a clean terminal state regardless of which way the results break.`,
  },
  {
    key: 'regime-first',
    angle: `Lead with REGIME SELECTION. The cheap-fan-out cost lever is dead; design the strategy around the regimes where the surviving claims COULD hold (governance-under-staleness; zero-src SDK onboarding; deep-invocable-helper on serial-dependency-depth measured in turns). Pick the corpus + arms + endpoints per regime. Be ruthless about not re-testing dead levers. Then derive the verifier + workflow that fit.`,
  },
  {
    key: 'minimal-decisive',
    angle: `Lead with the MINIMAL DECISIVE EXPERIMENT. What is the single cheapest, fastest experiment (or short ladder) that would DECISIVELY prove-or-falsify the strongest surviving claim, given $0-on-Claude-Max live runs (~50s/episode, DATAFETCH_AGENT=claude) and the existing harness? Favor a $0 hand-built ceiling probe before any expensive live run. Then scale only if the probe clears. Derive the verifier + workflow to match.`,
  },
];

const designDrafts = await parallel(
  designAngles.map((d) => () =>
    agent(
      `You are designing a complete RESEARCH STRATEGY whose outcome is to PROVE (or honestly falsify) the datafetch thesis, learning from a verifier that failed. Produce THREE integrated artifacts: (1) a BETTER VERIFIER, (2) a WORKFLOW STRATEGY (how to orchestrate the research with subagents/parallelism/adversarial-verification, and how the workflow embodies the verifier so it never repeats the indefinite-firing trap), (3) a concrete RESEARCH PLAN (claims, regimes, corpus, arms, endpoints, pre-registration, stats, milestones, falsification paths).

YOUR DISTINCT ANGLE: ${d.angle}

${THESIS}
${CRUX}
${mapDigest}

Requirements:
- Anchor in the surviving levers; explicitly exclude the dead cheap-fan-out cost lever.
- The verifier must admit "honest negative = DONE" and must TYPE blockers (impossible/user-gated/doable) with different responses.
- Pre-register endpoints where value actually lives (amortisation/persistence/governance/turns), not frontier single-session correctness.
- Be concrete: name corpora, arms, metrics, sample sizes, the confound controls, and the order of experiments (cheap falsifiers first).
- Keep intellectual honesty central: frame vs "the ephemeral re-derivation regime", never a literal SaC head-to-head; never pre-commit to a positive.
Write a thorough, structured proposal (markdown). This is your full draft.`,
      { label: `design:${d.key}`, phase: 'Design' },
    ),
  ),
);

const JUDGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['ranking', 'winner', 'bestIdeasToGraft', 'rationale'],
  properties: {
    ranking: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['key', 'score', 'strengths', 'weaknesses'],
        properties: {
          key: { type: 'string' },
          score: { type: 'number', description: '0-100 overall' },
          strengths: { type: 'string' },
          weaknesses: { type: 'string' },
        },
      },
    },
    winner: { type: 'string', description: 'key of the strongest draft to use as the synthesis spine' },
    bestIdeasToGraft: { type: 'array', items: { type: 'string' }, description: 'specific ideas from non-winning drafts to merge in' },
    rationale: { type: 'string' },
  },
};

const labelledDrafts = designAngles
  .map((d, i) => `\n===== DRAFT ${d.key} =====\n${designDrafts[i] ?? '(empty)'}`)
  .join('\n');

const judgement = await agent(
  `You are judging three research-strategy drafts on: (1) can it actually PROVE-OR-FALSIFY the surviving thesis (real falsification paths, right regimes/endpoints); (2) does its verifier avoid this session's failure (no hypothesis-as-completion-condition, admits honest-negative=DONE, types blockers); (3) honesty + reviewer-proofness (br19 ladder, confounds, pre-registration); (4) tractability ($0-first, cheap falsifiers before expensive runs); (5) clarity/actionability. Score each 0-100, pick the winner to use as the synthesis spine, and list specific ideas from the others to graft in.

${labelledDrafts}

Return the structured judgement.`,
  { label: 'design:judge', phase: 'Design', schema: JUDGE_SCHEMA },
);

const winnerKey = judgement?.winner ?? designAngles[1].key;
const winnerIdx = Math.max(0, designAngles.findIndex((d) => d.key === winnerKey));
const winnerDraft = designDrafts[winnerIdx] ?? designDrafts.filter(Boolean)[0] ?? '';

// ---------------------------------------------------------------------------
// PHASE 3 — ADVERSARIAL (skeptics stress-test the winning synthesis spine)
// ---------------------------------------------------------------------------
phase('Adversarial');

const lenses = [
  {
    key: 'verifier-gameability',
    prompt: `Adversarially attack the VERIFIER in this strategy. Does it repeat ANY part of this session's failure: does it (even subtly) make a positive outcome a completion condition? Is it gameable (could an agent "satisfy" it by fabricating, or by declaring everything blocked, or by producing redundant proxies)? Does it correctly TYPE impossible vs user-gated vs doable, and terminate cleanly on an honest negative? Find the holes and prescribe concrete fixes.`,
  },
  {
    key: 'falsifiability-and-regime',
    prompt: `Adversarially attack the SCIENCE. For each surviving claim: is there a REAL falsification path, or is the plan rigged to confirm? Are the regimes honest (is it quietly sneaking the dead cheap-fan-out lever back in)? Are the endpoints the ones where value actually lives, or a frontier single-session correctness trap that br19 says is ~0? Would a hostile reviewer accept the arms + confound controls + stats (paired McNemar/Wilcoxon, k>=5, pinned snapshot, contamination audit)? Prescribe fixes.`,
  },
  {
    key: 'tractability-and-honesty',
    prompt: `Adversarially attack TRACTABILITY + HONESTY. Is the cheapest decisive experiment actually first, or does it burn an expensive live run before a $0 probe could have killed the hypothesis? Are there hidden blockers (corpus data availability, df.llm.* for LLM-cored cost, a staleness injector, the deep-helper corpus)? Does it ever drift toward a literal "vs SaC" head-to-head (forbidden) instead of "vs the ephemeral regime"? Does it over-claim? Prescribe fixes and a realistic effort/sequence.`,
  },
];

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['holes', 'mustFix', 'verdict'],
  properties: {
    holes: { type: 'array', items: { type: 'string' } },
    mustFix: { type: 'array', items: { type: 'string' }, description: 'concrete required changes to the strategy' },
    verdict: { type: 'string', enum: ['sound-with-fixes', 'needs-major-revision', 'fundamentally-flawed'] },
  },
};

const verdicts = await parallel(
  lenses.map((l) => () =>
    agent(
      `${l.prompt}\n\n=== STRATEGY UNDER REVIEW (winner: ${winnerKey}) ===\n${winnerDraft}\n\n=== JUDGE'S GRAFT LIST (also in scope) ===\n${JSON.stringify(judgement?.bestIdeasToGraft ?? [], null, 2)}\n\n${CRUX}\n\nReturn the structured verdict.`,
      { label: `adv:${l.key}`, phase: 'Adversarial', schema: VERDICT_SCHEMA },
    ),
  ),
);

// ---------------------------------------------------------------------------
// PHASE 4 — SYNTHESIZE final research-strategy document
// ---------------------------------------------------------------------------
phase('Synthesize');

const final = await agent(
  `Write the FINAL research-strategy document (markdown) that proves-or-honestly-falsifies the datafetch thesis. Use the winning draft as the spine, graft the judge's best ideas from the other drafts, and APPLY every adversarial must-fix. The document is the deliverable; write it to be directly usable as a plan + a verifier spec.

Required sections:
1. Thesis, decomposed into falsifiable claims with regimes + endpoints + prior status (proven/falsified/partial/untested) + falsification criteria. Mark the dead cheap-fan-out cost lever explicitly as out of scope.
2. The Better Verifier — a concrete, checkable predicate over PROCESS-VALIDITY + HONEST-REPORTING + per-claim-falsification, with explicit terminal states (honest-negative=DONE, blocked-on-user=PAUSED with the unblocking input, doable=CONTINUE) and blocker typing. Include pseudocode/checklist. Show explicitly how it would have terminated cleanly on this session's honest negative.
3. The Workflow Strategy — how to orchestrate the research with subagents (map/design/adversarial/synthesize patterns, loop-until-dry, adversarial verification, pre-registration gates), and how the workflow embodies the verifier so it cannot repeat the indefinite-firing trap.
4. The Research Plan — per surviving claim: corpus, the relevant arms from the 5-arm ladder, endpoints + metrics, sample size + stats, confound controls, pre-registration, and the ORDER of experiments (cheapest decisive falsifier first; $0 hand-built ceiling probes before live runs). Include the realistic substrate-readiness gaps + their fixes.
5. Honesty guardrails — vs "the ephemeral re-derivation regime" not a literal SaC head-to-head; concede the single-session correctness null; never pre-commit to a positive; report realised b,c,b+c.
6. A one-screen TL;DR at the top.

${THESIS}
${CRUX}

=== WINNING DRAFT (${winnerKey}) ===
${winnerDraft}

=== JUDGE ===
${JSON.stringify(judgement, null, 2)}

=== ADVERSARIAL VERDICTS (apply every mustFix) ===
${JSON.stringify(verdicts.filter(Boolean), null, 2)}

=== PHASE-1 MAP (for any detail you need) ===
${mapDigest}

Output ONLY the final markdown document.`,
  { label: 'synthesize:final', phase: 'Synthesize' },
);

return {
  winnerKey,
  judgement,
  adversarialVerdicts: verdicts.filter(Boolean),
  finalDocument: final,
};
