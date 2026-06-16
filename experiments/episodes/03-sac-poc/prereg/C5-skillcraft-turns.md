# PRE-REGISTRATION — C5: deep+invocable helper, measured in AGENT TURNS, on SkillCraft pokedex

**Track:** C5 (DEFERRED -> promoted to near-term cheapest live falsifier)
**Claim:** A preseeded DEEP+INVOCABLE helper (`df.lib.pokedexEntries({ids})`, the ceiling-probe shape) lowers mean **agent turns (`llmCalls`)** on the held-out pokedex DAG below the Arm 1 inline-rewrite baseline at non-inferior correctness. Positioned vs the ephemeral re-derivation regime (Arm 1, workspace wiped per question), never a literal Search-as-Code head-to-head. C9 single-session-correctness null conceded up front.
**Corpus:** `pokeapi-pokedex` family; primary endpoint on held-out **h1x** (5 NEW-ARGUMENT pokemon x 5 endpoints; R4-disjoint from phase-1 levels e1..m2 per `h1x/task_config.json` meta).
**Model:** pinned dated snapshot `claude-sonnet-4-6` (logged in the sealed manifest; `DATAFETCH_AGENT=claude`).
**k:** >= 5 interleaved seeds (re-use the confirm-k5 seed_list = {1,2,3,4,5}; expand if the pilot's realised p_d demands it).

## 0. Endpoint (NO outcome direction — reporting, not a direction)
> We will measure and report the paired, clustered-by-question **mean agent turns (`llmCalls`)** of the **arm4-warm-DEEP** arm and **Arm 1**, the per-seed `llmCalls` distributions, the bootstrap 95% CI on the paired difference `mean(arm4_warm.llmCalls - arm1.llmCalls)`, the paired correctness (McNemar b/c/b+c on h1x), and the same-arm noise floor. We additionally report `toolCalls` as a SECONDARY descriptor (it is the field the cost lever already collapsed and is NOT the endpoint). We do NOT pre-commit to the sign of the turn-delta.

**TURNS field definition (load-bearing):** the primary endpoint is `llmCalls` (the agent-reasoning-turn proxy), NOT `toolCalls` (the API-call proxy). Justification from realised data: on the confirm-k5 shallow run the two diverged — `toolCalls` collapsed 17.2->2.2 while `llmCalls` ROSE 4.6->6.4. The strategy's "Arm 1's 4.6" is `llmCalls`. Reporting `toolCalls` as the headline would re-open the dead fan-out lever (P7 violation), so it is demoted to a secondary descriptor.

## 1. Arms (parity declared)
- **Arm 1** (comparator): tool-matched INLINE-REWRITE, `wipeLibBetweenQuestions:true`, no persistence. The br19 adversarial bar. Writes the full per-entity DAG walk inline (confirmed: realised `answer.ts` does one `Promise.all` over 5 entities, details+species parallel then evolution-gated-on-chain_id + moves + abilities).
- **Arm 4-warm-DEEP** (treatment): phase-2 reuse with the **preseeded** deep+invocable `df.lib.pokedexEntries` helper (ceiling-probe `lib_pokedexEntries.ts`). Caller writes only call+aggregate+emit (`answer_deep.ts`, 20 lines). Field logic byte-identical to the passing Arm 1 inline => correctness by-construction; full correctness validated by the live run.
- **Arm 0** (floor, optional): monolith / tools-withheld non-triviality floor.

**Preseed declaration (not crystallisation):** `src/observer/author.ts` crystallises SHALLOW `lib.toolFanout` (lines 1121/1169/1210), NOT a deep invocable helper. The deep helper is therefore PRESEEDED into phase-2 `lib/` (the ceiling-probe pattern). This is disclosed: the live run measures whether a deep+invocable helper, ONCE IT EXISTS, lowers turns — it does NOT claim the observer can produce it today (that is the C5 substrate change, gated behind this falsifier).

## 2. Invariant -> claim dependency map (P4, frozen pre-run, adversarially reviewed)
- **R2 prompt-parity** — PRIMARY. Arm 1 and Arm 4 share the parity body with the learned `df.lib.*` block MASKED (blocker-C-fixed renderer). Never embed a diverging `df.d.ts` in the parity body.
- **R4 new-argument-held-out** — PRIMARY. h1x entities are disjoint from phase-1 e1..m2, so the deep helper must GENERALISE over `ids` (not memoize a phase-1 cache). A memoization-floor cache-hit on h1x VOIDS the affected row.
- **Void-on-violation orthogonality check:** any invariant eligible for DONE-INVALIDATED (e.g. an arm5a-style memoization cache-hit) must be ORTHOGONAL to the turn-delta sign. An invariant whose violation would refute the turn headline CANNOT be void-on-violation. Adversarial-agent confirms before the run.

## 3. Stats
McNemar (mid-p when b+c<25) on h1x correctness, clustered by question across seeds. Paired bootstrap CI on `mean(arm4_warm.llmCalls - arm1.llmCalls)`. Wilcoxon signed-rank on per-question `llmCalls` as a CO-PRIMARY. Same-arm noise floor reported in every table. NI correctness margin: -5pp (claimed iff CI lower bound on correctness diff > -5pp; otherwise "observed delta X pp, NI not established"). **B1 is a PILOT** — n=5 cannot establish NI on a ~0 correctness effect; the pilot reports realised p_d/b/c only and is FORBIDDEN from emitting an NI verdict. A powered run is sized n=7.849*p_d/delta^2 from the pilot if decision-relevant.

## 4. Hardness screen (gates the live run)
Arm 1 h1x pass-rate must be materially below ceiling (r>0). Realised confirm-k5: Arm 1 h1x = 4/5 (80%), below ceiling — screen PASSES (a trivially-saturated corpus cannot report a turn "tie" as a C5 clear).

## 5. Verifier predicate (P1-P7) — every box checkable from committed artifacts BEFORE the run
- **P1 PRE-REG-FROZEN:** this prereg committed; `manifest.prereg_sha == git hash-object` this file; git-timestamp(prereg) precedes earliest artifact; `manifest.dirty_tree == false` (wrapper exit 3 if `git status --porcelain` non-empty — current tree IS dirty, launch correctly refused until clean).
- **P2 RUN-CANONICAL:** `run-manifest.json` sealed BEFORE the seed loop; `|seed_list| >= 5`; declares model_id, config_hash, scorer_sha, normalizer_sha, runner_sha, arms_module_sha, drop_reasons[]; an artifact exists for EVERY sealed (arm,seed,phase); no extra artifacts folded in; every `run-info.json.configHash == manifest.config_hash`.
- **P3 ENDPOINT-RECOMPUTED:** verifier re-runs `score-cross-arm.ts` from raw artifacts and reproduces the paired `llmCalls` means + CI + correctness b/c/b+c; SAMPLED subset re-derives `officialPassed` from raw `answer.ts`+gold and re-derives `llmCalls` from raw SDK usage logs (NOT trusting `episode.llmCalls`); every headline number resolves to a file:line/JSON-pointer.
- **P4 INVARIANTS-CLASSIFIED:** §2 map committed; R2+R4 PRIMARY; void-on-violation orthogonal to the turn sign.
- **P5 VERDICT-DETERMINISTIC:** `claimUpheld := turn_delta_below_0 AND correctness_NI_pass AND R2_holds AND R4_holds AND gates_green`; report's claimUpheld must EQUAL the computed value; `claimUpheld=false` recorded as DONE-HONEST-NEGATIVE = PASS.
- **P6 GATES-GREEN:** `pnpm typecheck`==0; `pnpm test`==0; governance probes pass; scorer-determinism (same artifacts -> same score twice).
- **P7 REGIME-GUARD:** endpoint is `llmCalls` (agent turns), which does NOT reduce to any dead lever {cheap-fan-out cost, shallow-helper cost, single-session-correctness-as-PRIMARY, literal-SaC head-to-head, tier-collapse-as-proof}. `toolCalls` is explicitly demoted to a secondary descriptor so the fan-out lever cannot sneak back as the headline. Adversarial-agent read confirms no dead lever in prose.

## 6. Branch coverage (every result branch -> a terminal state; progression NOT conditioned on outcome direction)
1. **arm4-warm-DEEP mean `llmCalls` < 4.6 AND correctness NI holds AND R2/R4 hold AND gates green** -> claimUpheld=true -> **DONE-POSITIVE**.
2. **arm4-warm-DEEP mean `llmCalls` >= 4.6 (delta >= 0) OR correctness NI breached**, R2/R4 hold, gates green -> claimUpheld=false -> **DONE-HONEST-NEGATIVE** (= PASS; the state the shallow-warm run would have reached, 6.4 > 4.6).
3. **R2 or R4 PRIMARY invariant violated** (e.g. preseed leaks a memoizable cache, or parity body diverges) -> **DONE-INVALIDATED** (terminal PASS; turn evidence uninterpretable, NOT laundered into a negative).
4. **Deep helper not yet preseeded / sealed manifest emitter not yet built** -> **IN-PROGRESS** naming the concrete action (preseed `lib_pokedexEntries.ts` into phase-2 lib/; build the run-manifest emitter in run-sac-poc.sh).
5. **df.llm.* required** (it is NOT — pokedex helper is non-LLM-cored) -> would be **BLOCKED-ENVIRONMENTAL**; not reached for this island.
6. **Corpus identity reserved by Goal text** -> **PAUSED-USER-GATED** (not reached: pokedex corpus is fixed, no enumerated reserved-decision ID applies).
7. **Only path needs fabrication / hard-constraint break, confirmed by recomputable proof + 2nd agent** -> **BLOCKED-IMPOSSIBLE** (not reached; preseed + manifest are doable).

**Decoupled progression:** the powered run (B2-analogue) runs iff the pilot reached a terminal state AND the realised turn-delta CI is inconclusive within a pre-registered outcome-blind band — NEVER "iff turns came out below 4.6." A DONE-HONEST-NEGATIVE terminates the C5 ladder; no next rung is owed.

## 7. $0 probe precedes live (CLEARED)
The ceiling-probe (Attempt 13) + this projected-TURNS falsifier (executed against realised confirm-k5 artifacts) are committed BEFORE any live spend. Realised anchors recorded: Arm 1 h1x `llmCalls`=4.6 / `toolCalls`=17.2 / correctness 4/5; shallow-warm h1x `llmCalls`=6.4 / `toolCalls`=2.2 / correctness 2/5. The projection (deep helper -> ~2-3 turns) and its reachable fail condition (warm `llmCalls` >= 4.6, as the shallow arm already realised) are pre-registered.
