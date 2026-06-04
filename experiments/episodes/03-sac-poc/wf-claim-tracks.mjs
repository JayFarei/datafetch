export const meta = {
  name: 'research-claim-tracks',
  description: 'Pursue the surviving datafetch claims (C5 turns, C8 persistence, C4 governance-under-staleness, C2 onboarding) as parallel goal-tracks: per claim produce a branch-coverage-gated pre-registration, execute the cheapest $0 falsifier possible, spec the substrate prerequisites, and pass the new-verifier pre-reg gate. Amend the corpus-per-claim strategy.',
  phases: [
    { title: 'Frame', detail: 'amend strategy with corpus-per-claim; spec shared prerequisites (sealed run-manifest emitter, verifier-predicate template)' },
    { title: 'Pursue', detail: 'one parallel track per claim: pre-reg + $0 falsifier executed + build-spec + readiness' },
    { title: 'Gate', detail: 'branch-coverage pre-reg gate review per track (adversarial)' },
    { title: 'Kickoff', detail: 'synthesise the executable kickoff package + cheapest-decisive-first order' },
  ],
};

const REPO = '/Users/jayfarei/src/tries/2026-05-01-hackathon';
const SP = `${REPO}/experiments/episodes/03-sac-poc`;

const GROUNDING = `
CONTEXT. Read ${SP}/RESEARCH-STRATEGY.md for the full strategy + the new verifier (P1-P7, terminal states). Key facts you must honor:

THE FALSIFIED LESSON (the receipt): SkillCraft P1 showed -41% tokens at neutral correctness, but ONLY vs the weak substrate-OFF baseline (DATAFETCH_DISABLE_LEARNING). Against br19's honest bar Arm 1 (tool-matched INLINE-REWRITE, no persistence) the cost win collapsed to M*=+Infinity (the SaC-PoC confirmatory run, ${SP}/eval... confirm-k5-pokeapi-h1x). SkillCraft per-entity fan-out is BELOW the inline-rewrite threshold (cheap to derive inline), so cost/amortisation claims structurally collapse there. This is a DEAD lever — fenced.

THE NEW VERIFIER (apply it; never restate the failed one): a completion predicate verifies PROCESS-VALIDITY + HONEST-REPORTING + per-claim FALSIFICATION bookkeeping, NEVER an outcome direction. claimUpheld=false is DONE-HONEST-NEGATIVE = PASS. Terminal states: DONE-POSITIVE / DONE-HONEST-NEGATIVE / DONE-INVALIDATED / PAUSED-USER-GATED / BLOCKED-IMPOSSIBLE / BLOCKED-ENVIRONMENTAL / IN-PROGRESS (only IN-PROGRESS re-fires). A pre-registration is REJECTED unless EVERY result branch maps to a terminal state and progression is NOT conditioned on outcome direction (incl. in prose). Cheapest $0 falsifier runs before any live spend.

THE CORPUS-PER-CLAIM DECISION (just settled with the user — this supersedes the single-corpus framing):
- C5 (deep-invocable helper, measured in TURNS, serial-dependency depth): corpus = SkillCraft pokedex (serial-depth DAG; the $0 ceiling probe at ${SP}/ceiling-probe/ is already done; harness ready). Turns endpoint is immune to the cheap-to-inline TOKEN trap that killed the cost claim.
- C8 (persistence-as-abstraction beats transcript): corpus = SkillCraft. Arm 2 (df.lib) vs Arm T (raw-prior-trajectory injection) at EQUAL context budget. Cost/correctness at matched correctness.
- C4 (governance-under-staleness): corpus = CRAG (tri-state +1/0/-1; the -1 hallucination cells are where 'decline beats confidently-wrong' becomes visible; binary SkillCraft scoring CANNOT show it). Needs a drift/staleness injector + r>0 hardness screen (FinChain disqualified, saturated).
- C2 (zero-src onboarding sufficiency): corpus = a FRESH DB-shaped dataset (BIRD/Spider) — SkillCraft is the substrate's home corpus so it proves no generality. Uses df.db + answerEquals, sidesteps the br17 df.tool.* blockers.

HONESTY: positioning is vs the ephemeral re-derivation regime, NEVER a literal Search-as-Code head-to-head. Concede the single-session correctness null. Never fabricate a probe result — if a falsifier needs a live run you cannot do, say so and give the honest projected/design version with its reachable fail condition. Report realised b,c,b+c when relevant.`;

// ---------------------------------------------------------------------------
// PHASE 1 — FRAME
// ---------------------------------------------------------------------------
phase('Frame');

const frameResults = await parallel([
  () => agent(
    `Write the CORPUS-PER-CLAIM amendment to insert into ${SP}/RESEARCH-STRATEGY.md. It must: (1) state the receipt (SkillCraft -41% was vs the weak substrate-OFF baseline; collapsed to M*=+inf vs Arm 1 inline-rewrite; SkillCraft fan-out is below the inline threshold => cost claims dead there); (2) give the corpus-per-claim table (C5->SkillCraft pokedex turns; C8->SkillCraft persistence; C4->CRAG governance; C2->fresh DB BIRD/Spider onboarding) with the one-line WHY each; (3) explicitly distinguish the SkillCraft HARNESS (eval/skillcraft/, reused as the runner skeleton) from the SkillCraft BENCHMARK/tasks (wrong corpus for cost/governance headlines); (4) PROMOTE C5-on-SkillCraft-turns from 'deferred' to the near-term cheapest live falsifier, with the rationale (turns endpoint immune to the token trap; ceiling probe done; harness ready). Output ONLY the markdown section (with a heading) ready to append. ${GROUNDING}`,
    { label: 'frame:corpus-amendment', phase: 'Frame' },
  ),
  () => agent(
    `Spec the SHARED PREREQUISITES every live track depends on, precisely enough to implement next. Read ${REPO}/src/eval/skillcraftFullDatafetch.ts (it emits per-(arm,seed,phase) run-info.json today), ${REPO}/eval/skillcraft/scripts/run-sac-poc.sh, ${REPO}/eval/skillcraft/scripts/score-cross-arm.ts, ${REPO}/src/eval/sacArms.ts. Deliver: (A) the SEALED RUN-MANIFEST EMITTER spec — the runner must write ONE atomic run-manifest.json BEFORE the seed loop {seed_list,model_id,config_hash,scorer_sha,normalizer_sha,runner_sha,drop_reasons[],dirty_tree} and REFUSE to launch if git status --porcelain is non-empty; name the exact file/function to change and the data sources for each field. (B) the VERIFIER-PREDICATE TEMPLATE (P1-P7) instantiated as a reusable checklist a per-track pre-reg must satisfy. (C) the ONBOARDED-NO-LEARNING arm spec for sacArms.ts (interfaceMode=generated df.d.ts, learningEnabled:false, governanceGate:null, phases:1) — confirm by reading sacArms.ts that arm2 is learning-ON and this arm does NOT exist. Be concrete (file:line where possible). ${GROUNDING}`,
    { label: 'frame:shared-prereqs', phase: 'Frame' },
  ),
]);
const [corpusAmendment, sharedPrereqs] = frameResults;

const frameDigest = `=== CORPUS-PER-CLAIM AMENDMENT ===\n${corpusAmendment}\n\n=== SHARED PREREQUISITES ===\n${sharedPrereqs}`;

// ---------------------------------------------------------------------------
// PHASE 2 — PURSUE (one parallel track per claim)
// ---------------------------------------------------------------------------
phase('Pursue');

const TRACK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['claim', 'corpus', 'preregMarkdown', 'zeroDollarFalsifier', 'buildSpec', 'readiness', 'terminalBranches'],
  properties: {
    claim: { type: 'string' },
    corpus: { type: 'string' },
    preregMarkdown: { type: 'string', description: 'the full branch-coverage-gated pre-registration for this claim, markdown' },
    zeroDollarFalsifier: {
      type: 'object',
      additionalProperties: false,
      required: ['description', 'executedNow', 'result', 'reachableFailCondition'],
      properties: {
        description: { type: 'string' },
        executedNow: { type: 'boolean', description: 'true iff you actually executed it via reasoning/reading; false if it needs a live run' },
        result: { type: 'string', description: 'the honest finding (projected/design version if not executable now — never fabricated)' },
        reachableFailCondition: { type: 'string', description: 'the concrete result that would KILL the claim at $0' },
      },
    },
    buildSpec: { type: 'array', items: { type: 'string' }, description: 'precise DOABLE substrate build tasks to reach the first live run (file:fn, additive, testable)' },
    readiness: { type: 'string', description: 'corpus/data/substrate readiness; typed blockers (DOABLE / BLOCKED-ENVIRONMENTAL / PAUSED-USER-GATED) per the new verifier' },
    terminalBranches: { type: 'array', items: { type: 'string' }, description: 'enumerate every result branch and the terminal state it maps to (branch-coverage proof)' },
  },
};

const claimTracks = [
  {
    key: 'C5-skillcraft-turns',
    prompt: `TRACK C5 — deep-invocable helper measured in TURNS on SkillCraft pokedex (the cheapest live falsifier).
Read ${SP}/ceiling-probe/CEILING-PROBE.md, ${SP}/ceiling-probe/lib_pokedexEntries.ts, ${SP}/ceiling-probe/answer_deep.ts, and skim ${REPO}/src/eval/skillcraftFullDatafetch.ts for the pokedex task/DAG shape.
EXECUTE the $0 PROJECTED-TURNS falsifier NOW: from the pokedex DAG's serial-dependency structure (entity -> details/species -> chain_id -> evolution -> moves/abilities), project the INLINE turn count (serial steps the agent must take when each call depends on the prior output) vs the WARM path (one df.lib deep-helper call = ~1-2 turns). State whether the projected turn-delta favours warm, and the reachable fail condition (projected warm turns NOT below inline). Be honest: a frontier agent may batch independent sub-calls within a turn — account for that.
Then write the branch-coverage-gated pre-reg for the LIVE run (warm deep-helper vs Arm 1 inline, primary endpoint = paired TURNS at non-inferior correctness, k>=5, pinned snapshot). Note the substrate prereq: the observer crystallises SHALLOW today (src/observer/author.ts hardwires lib.toolFanout) so the deep helper must be PRESEEDED (the ceiling-probe pattern) for the live run — that is a DOABLE build task, not a blocker.`,
  },
  {
    key: 'C8-skillcraft-persistence',
    prompt: `TRACK C8 — persistence-as-abstraction beats persistence-as-transcript, on SkillCraft.
Read ${REPO}/src/eval/sacArms.ts to see which arms exist. The contrast is Arm 2 (df.lib learned interface) vs Arm T (raw prior-trajectory injection into context) at EQUAL context budget. Confirm whether an Arm T (history-injection) arm exists or must be authored.
The $0 work: DESIGN the equal-context-budget mechanics (how to match token budget between the df.lib arm and the raw-transcript arm so the contrast isolates abstraction from mere context) and assess readiness; this is a DESIGN deliverable (a live run is needed for the result), so executedNow=false with an honest design + reachable fail condition (Arm T matches/beats Arm 2 at equal budget => persistence gain is context not governed abstraction). Write the branch-coverage-gated pre-reg (McNemar + Wilcoxon on cost at equal budget, k>=5). This is the cleanest intellectual-honesty control br19 says the prior 7-arm ladder omitted.`,
  },
  {
    key: 'C4-crag-governance',
    prompt: `TRACK C4 — governance-under-staleness on CRAG (highest value-if-true).
Read ${REPO}/kb/br/17-crag-shape-probe-findings.md (the df.tool.* signature-collapse + clone-fallback blockers), ${REPO}/eval/skillcraft/probes/ (the 4 governance probes) and ${REPO}/src/observer/quarantineValidator.ts (the gate).
The $0 work you CAN execute: design the DRIFT/STALENESS INJECTOR as an extension of the existing in-process governance probes (mutate source data between crystallise and reuse; assert the governed gate DECLINES the now-stale helper while ungoverned-persistent emits the stale value) — state precisely how to extend the probe harness; this is a DOABLE build the workflow could later implement. The LIVE endpoint (Truthfulness = Accuracy - HallucinationRate on the -1 cells, Arm 2 vs Arm 3 under injected drift) needs CRAG data (BLOCKED-ENVIRONMENTAL: not in-env) + the br17 blockers cleared (re-probe; df.db.* remap reduces but does not eliminate per br17). Be honest about these typed blockers. Write the branch-coverage-gated pre-reg. The corpus IDENTITY (CRAG db-slice vs alternative) is the one legitimately PAUSED-USER-GATED input.`,
  },
  {
    key: 'C2-fresh-db-onboarding',
    prompt: `TRACK C2 — zero-src onboarding sufficiency on a FRESH DB-shaped corpus.
Read ${SP}/ONBOARDING.md (the proven C1 mechanism + the unverified end-to-end half), ${REPO}/tests/sac-zero-src-onboarding.test.ts (the mechanism test), ${REPO}/src/eval/sacArms.ts (arm1 inline-rewrite exists; the onboarded-no-learning arm does NOT — confirm).
The $0 work: assess fresh-DB-corpus options (BIRD / Spider 2.0 — in-env? data availability?), design the r>0 hardness screen (Arm 1 pass-rate materially below ceiling so a NI tie is not a saturation artifact), and design the honest floor probe B0 (a real end-to-end mount smoke over real DB data + a few answerEquals-graded golds — NOT a biased hand-solve). executedNow=true only for the parts you can actually determine by reading (e.g. arm existence, mechanism readiness); honest design for the rest. Write the branch-coverage-gated pre-reg: comparator = Arm 1 (NOT an invented hand-tuned prompt) + Arm 0 floor; endpoint = paired NI on answerEquals exact-match, report b/c/b+c, NI iff CI lower > -5pp, NO pre-commit to NI. Note the corpus IDENTITY is the one PAUSED-USER-GATED input; corpus ACQUISITION is a typed DOABLE/BLOCKED-ENVIRONMENTAL milestone.`,
  },
];

const tracks = await parallel(
  claimTracks.map((t) => () =>
    agent(`${t.prompt}\n\n${GROUNDING}\n\n${frameDigest}\n\nReturn the structured track object.`, {
      label: `pursue:${t.key}`,
      phase: 'Pursue',
      schema: TRACK_SCHEMA,
    }),
  ),
);
const validTracks = tracks.filter(Boolean);

// ---------------------------------------------------------------------------
// PHASE 3 — GATE (branch-coverage pre-reg gate per track, adversarial)
// ---------------------------------------------------------------------------
phase('Gate');

const GATE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['claim', 'verdict', 'unmappedBranches', 'outcomeDirectionLeak', 'deadLeverLeak', 'mustFix'],
  properties: {
    claim: { type: 'string' },
    verdict: { type: 'string', enum: ['APPROVE', 'REJECT'] },
    unmappedBranches: { type: 'array', items: { type: 'string' }, description: 'result branches that do NOT map to a terminal state (empty if fully covered)' },
    outcomeDirectionLeak: { type: 'string', description: 'any place progression/completion is conditioned on outcome direction, incl. in prose; "none" if clean' },
    deadLeverLeak: { type: 'string', description: 'any re-opening of a dead lever (cheap-fan-out cost; shallow-helper cost; single-session-correctness-as-primary; literal SaC); "none" if clean' },
    mustFix: { type: 'array', items: { type: 'string' } },
  },
};

const gateVerdicts = await parallel(
  validTracks.map((t) => () =>
    agent(
      `You are the branch-coverage PRE-REG GATE for the new verifier. REJECT this track's pre-registration unless: (1) every result branch maps to a terminal state (no branch lands IN-PROGRESS); (2) progression/completion is NOT conditioned on outcome direction ANYWHERE incl. prose (the endpoint reads "we will measure and report X", never "X must hold"); (3) it does not re-open a dead lever (P7); (4) a $0 falsifier precedes any live spend; (5) live-run preconditions are materialised or honestly typed as DOABLE/BLOCKED. Be adversarial — this is the gate that prevents the indefinite-firing trap.\n\n=== TRACK (${t.claim}) ===\n${JSON.stringify(t, null, 2)}\n\n${GROUNDING}\n\nReturn the structured gate verdict.`,
      { label: `gate:${t.claim}`, phase: 'Gate', schema: GATE_SCHEMA },
    ),
  ),
);

// ---------------------------------------------------------------------------
// PHASE 4 — KICKOFF synthesis
// ---------------------------------------------------------------------------
phase('Kickoff');

const kickoff = await agent(
  `Synthesise the executable RESEARCH-PROGRAM KICKOFF package (markdown) from the per-claim tracks + their gate verdicts. Apply every gate mustFix to the recommendations. Produce:
1. A one-screen status board: each claim-goal, its corpus, its $0-falsifier result (and whether it KILLED/CLEARED/needs-live), its gate verdict, its terminal-branch coverage.
2. The cheapest-decisive-first EXECUTION ORDER across all four goals (which $0 falsifier or build task runs next, and why — esp. whether C5's projected-turns probe already gives a clear/kill signal).
3. The consolidated BUILD-SPEC backlog (sealed run-manifest emitter; onboarded-no-learning arm; drift injector; deep-helper preseed) with effort + which goal each unblocks, marked DOABLE.
4. The typed BLOCKERS needing the user (PAUSED-USER-GATED: the CRAG corpus identity, the fresh-DB corpus identity) and the typed BLOCKED-ENVIRONMENTAL (CRAG/BIRD data not in-env; br17 df.tool.* blockers).
5. An explicit honesty check: confirm no goal's completion is conditioned on a positive outcome; confirm the dead cheap-fan-out lever is not re-opened anywhere.

=== TRACKS ===
${JSON.stringify(validTracks, null, 2)}

=== GATE VERDICTS ===
${JSON.stringify(gateVerdicts.filter(Boolean), null, 2)}

${GROUNDING}

Output ONLY the markdown kickoff package.`,
  { label: 'kickoff:synthesize', phase: 'Kickoff' },
);

return {
  corpusAmendment,
  sharedPrereqs,
  tracks: validTracks,
  gateVerdicts: gateVerdicts.filter(Boolean),
  kickoff,
};
