# PRE-REGISTRATION — SaC-aligned PoC on SkillCraft

> Pre-registered BEFORE the k≥5-seed confirmatory run (Milestone 8 of
> `kb/plans/009-sac-aligned-poc-skillcraft.md`). Once the run starts, the
> values below are frozen; deviations are reported as such, not silently
> changed. This is the credibility spine: the single-session correctness
> null is conceded up front (R7 of the brief; Decision #7), and the
> headline is a falsifiable break-even, not a token delta. All token
> quantities are model-context tokens (`effectiveModelContextTokens`,
> cached input at full weight; see `CONTRACT.md` §b/§c).

## 1. PRIMARY endpoint — break-even M* vs M0 (R6)

```
M* = (build_cost + governance_cost) / (arm1_inline_cost_per_q - arm4_warm_call_cost_per_q)
```

over eligible warm reuses (arm4 phase-2 held-out siblings actually answered
by calling the frozen helper), with a clustered-by-question bootstrap 95% CI.

- **Success rule:** the **95% upper** CI of `M*` ≤ `M0`.
- **Clean fail:** denominator ≤ 0 -> `M* = +infinity`.
- **Cost unit (pinned 2026-06-02, user-confirmed):** full-weight model-context
  tokens (`effectiveModelContextTokens`, cached at 1×) for both M* and the
  attribution ladder; reported as a token claim, never a dollar claim. The
  char-based `parityFloorTokens` is a DIAGNOSTIC (it cancels in the arm1-vs-arm4
  paired difference); the denominator is computed as that paired full-weight
  difference directly. See `CONTRACT.md` §(c) "Cost unit … tie-breaker".
- **Required dollar-equivalent tie-breaker:** the scorer recomputes M* and the
  attribution diffs under three units — `fullWeight` (×1, headline),
  `freshPlusOutput` (×0), `dollarEquivalent` (cached ×0.1). The claim counts as
  surviving the dollar ledger only if `claimSurvivesDollarLedger` is true (M*
  still ≤ M0 and arm4 still beats both floors under ×0.1). If the win holds at
  full weight but not at ×0.1, the artifact concedes a token-only win. ×0.1 is a
  list-price approximation; the pinned price snapshot is recorded at run start.
- **`governance_cost` ≈ 0** by construction (in-process FAC replay, no model
  call), so M* pays back the one-time governed helper BUILD, not the gate.

### M0 (the claimed tenant reuse density) — PLACEHOLDER, set before run

`M0 = 8` warm reuses per family **[PLACEHOLDER — confirm at Milestone 8]**.

Reasoning for the placeholder (to be finalised with the realised phase-1
build cost in hand, but pre-committed in shape):

- SkillCraft's measured conditional reuse is R7 = 0.846 (the brief's direct
  evidence reuse fires), and each family carries 6 levels
  (`e1,e2,e3,m1,m2,h1`, `LEVEL_ORDER` at `skillcraftFullDatafetch.ts:43`).
  A single tenant that runs a family to convergence and then issues a
  handful of held-out siblings is the unit of amortisation.
- `M0` must be set to a reuse density that is **realistic for a single
  per-tenant family lifecycle** and below the count at which the claim is
  trivially true. Anchoring at the low end of "more than one warm reuse but
  fewer than a full second family pass" gives `M0 ≈ 6–10`. We pre-register
  `M0 = 8` as the midpoint; if the realised `build_cost + governance_cost`
  makes 8 unreachable, that is a clean, honest fail — we do NOT move `M0`
  after seeing M*.
- SaC's published design sits at `M* = infinity` (re-pays codegen every
  trajectory). The claim is only that datafetch's `M*` is finite and ≤ `M0`.

> Builders: do not hardcode `M0` in the scorer. The scorer reads `M0` from
> `--m0 <int>` (default unset -> error) so the pre-registered value is an
> explicit run argument captured in the run manifest.

## 2. Attribution-ladder success rule (R7, co-primary)

The callable-interface claim is upheld **iff BOTH hold**:

- arm4 mean `effectiveModelContextTokens` < arm5a's AND < arm5b's on the
  phase-2 held-out siblings, with the clustered bootstrap CI of each
  pairwise difference excluding 0 (arm4 strictly cheaper than the
  memoization floor AND the instruction-compression floor); AND
- arm4 is non-inferior in correctness to BOTH arm5a and arm5b per the rule
  in §3.

If arm4 fails to beat either floor, the win is attributed to memoization
(arm5a) or instruction-compression (arm5b), NOT to the callable typed
interface, and we report that honestly. arm4-vs-arm1 is SECONDARY
(marginal-cost, proves cross-session persistence is real), never the headline.

## 3. Clustered-correctness non-inferiority rule (R9)

- k≥5 interleaved seeds per arm (see §4).
- Aggregate per question (`canonicalTaskKey`) to a **majority-vote**
  correctness label BEFORE pairing. Never treat `(family, level, seed)` as
  independent pairs (pseudo-replication; Decision #6).
- Pairwise: McNemar 2×2 on per-question majority labels (reuse
  `mcnemar_two_sided`, `p1-paired-analysis.py:88`).
- **NI margin = -5pp.** Non-inferiority is claimed ONLY if the
  pre-registered clustered CI **lower bound > -5pp**. Otherwise the honest
  report is: "observed delta X pp, formal non-inferiority not established."
- NI is conditioned on the pre-registered CI only, NOT on realised
  discordance (conditioning on realised discordance is a forking-paths
  defect; Decision #6).
- Report family-level robustness and BH-FDR across slices. Report the
  within-arm seed-to-seed noise floor in every table.

### Pre-registered single-session correctness null

Per the brief (R7, Decision #7) and our CRAG 0/2706 finding: we pre-register
that arm4 (and arm2) show **~0 single-session correctness lift** over arm1
on a frontier model. This is reported as a finding, not a weakness. No
single-session correctness improvement over inline-rewrite is claimed.

## 4. k≥5 interleaved-seed protocol

- **k = 5 seeds** minimum per arm (more if wall-clock allows; pre-register
  the exact count at run start in STATUS).
- Seeds are **interleaved** across arms, not run arm-by-arm, to spread any
  model/infra drift evenly across arms (a block design would confound arm
  with time-of-run).
- Pinned dated model snapshot recorded in `run-info.json` (model + reasoning
  effort + date). The same snapshot is used for every arm and seed.
- **Held-out split (pinned):** phase-1 build uses `e1,e2,e3,m1,m2`
  (`LEARN_FROM_LEVELS`, `skillcraftFullDatafetch.ts:49`); phase-2 reuse uses
  the `h1` hard level as the new-argument held-out sibling per family. h1 is
  excluded from learning today (`LEARN_FROM_LEVELS` omits it) precisely so it
  is genuinely held out. If a family lacks a usable h1, that family is
  dropped from the phase-2 set and the drop is reported (not silently
  filled).
- Phase-2 siblings are **new-argument** so nothing decisive is answerable
  from cache (R4): the scorer asserts `decisiveCacheHit == false` on all
  phase-2 rows.
- Run all six arms (0/1/2/3/4/5a/5b) on the same family set and same seeds.

## 5. Governance qualitative scope (R8)

- **Three deterministic probes** (wrong-sibling clone, under-parameterised
  clone, source-drift) against a frozen gate with a blind generator and
  held-out siblings. Pre-registered expected outcome: **arm2 (gate on)
  declines on all three; arm3 (gate off) emits the wrong/stale value on all
  three.** Reported as deterministic PASS/FAIL, not a rate.
- **Blind 20+20 mutant/valid mini-suite**, reported **qualitatively** with
  rule-of-three (wide) uncertainty bounds. No measured organic safety rate
  is claimed.
- The quantitative 50+50 paper-grade suite and any organic CRAG ON/OFF
  governance endpoint are explicitly DEFERRED (Scope Boundaries). CRAG
  governance is a confirmed p=0.41 noise null and is not used here.

## 6. What is NOT claimed (pinned disclosures, carried into the artifact)

- Post-hoc SkillCraft selection (chosen after observing R7 = 0.846):
  disclosed; legitimate for an existence proof, disqualifying only for a
  generality claim.
- The `InternalToolFanoutPlan` eval-stub planner
  (`skillcraftFullDatafetch.ts:3587-3640` region): logged as byte-identical
  across arms; a planner-neutralised slice is reported; the planner is not
  generalised here.
- `df.llm.*` first-class composable: future work (`src/snippet/dfBinding.ts`
  is db/lib/tool/answer/run only).
- Non-numeric / text replay contract: roadmap; the validator's 1% numeric
  FAC tolerance (`quarantineValidator.ts:51-58`) is unchanged.
- Cross-tenant transfer: out of scope.
- No "structurally cannot" language about SaC; the honest claim is that
  SaC's published design keeps helpers ephemeral and carries no governance
  contract.

## 7. The pinned narrow claim sentence (verbatim in the artifact, R10)

> "On a corpus selected because reuse is structurally necessary, a governed
> persistent library amortises cross-session codegen cost that SaC's
> ephemeral helpers re-pay every session, at non-inferior correctness."

## 8. Pre-registration sign-off (frozen 2026-06-02, before the confirmatory run)

- [x] `M0` finalised: **8** (unchanged from the pre-registered placeholder; NOT adjusted from observed build cost — moving M0 after seeing M* is a forking-paths defect we explicitly forbid, §1).
- [x] k (seed count) finalised: **5** interleaved seeds per arm.
- [x] Model snapshot + date: **claude-sonnet-4-6** via `claude-p` (`DATAFETCH_AGENT=claude`), run date **2026-06-02**; exact resolved model recorded per-episode in each `run-info.json`. (Same snapshot validated the crystallise+reuse smoke, commit `d30903917`.)
- [x] Family set: **cat-facts-collector, dog-breeds-encyclopedia, pokeapi-pokedex** — confirmed per-entity tool fan-out families (the shape that crystallises `toolFanout`), chosen for higher expected pass-rate so arm4 phase-1 reliably crystallises a freezable helper. This is a post-hoc, easier-family selection (disclosed per §6); it strengthens the existence proof, and is disqualifying only for a generality claim, which is not made here. (`random-user-database` and `countries-encyclopedia` were rejected after the pilot smokes: the former lacks per-entity fan-out, the latter had a low single-seed pass-rate.)
- [x] Held-out split confirmed: phase-1 build = `e1,e2,e3,m1,m2` (`LEARN_FROM_LEVELS`); phase-2 reuse = `h1` (held out of learning).
- [x] This file committed BEFORE the confirmatory run starts (commit precedes the `run-sac-poc.sh ... --live` launch).

### Run command (recorded for reproducibility)

```
# per-family (robust to a single-family abort), k=5, all 7 arms, sonnet-4-6:
for fam in cat-facts-collector dog-breeds-encyclopedia pokeapi-pokedex; do
  DATAFETCH_AGENT=claude eval/skillcraft/scripts/run-sac-poc.sh \
    --families "$fam" --seeds 5 --m0 8 --model claude-sonnet-4-6 --live \
    --out-root eval/skillcraft/results/sac-poc/confirm-k5/<fam>
done
# then concat all normalized.jsonl and score-cross-arm.ts --m0 8 over the union.
```

### Amendment 2026-06-03 (disclosed; protocol correction, NOT a data-driven change)

Run 1 under the config above (committed `bfce8bd60`) was executed and is INVALID
by its own gates (RUN-LOG Attempt 6): 39 invariant violations. Diagnosis surfaced
three defects, now fixed:
- **Blocker A** (`41e3eb77c`): arm4's parity binding told the agent to call a
  hardcoded non-existent helper `df.lib.familyFanout` in both phases → arm4
  phase-1 collapsed to ~9% correctness, crystallised nothing. Fixed (phase-aware
  binding); arm4 phase-1 now ~100%, crystallises + freezes `toolFanout`.
- **Blocker C** (`1d5f7b05b`): the parity body embedded df.d.ts, which diverged
  once arm4 hydrated a learned helper → parity broke. Fixed (mask the learned
  `df.lib.*` block in the parity body); 0 parity violations.
- **Blocker B** (`355747fb0`): SkillCraft's h1 is a CUMULATIVE superset of e1..m2
  (~80% entity overlap), so h1 is NOT new-argument and the arm5a memoization floor
  cache-hit it (R4 violated). Fixed (Option C, existence proof): a synthetic
  new-argument held-out level.

**Amended confirmatory config (Run 2):**
- Family set: **pokeapi-pokedex ONLY** (existence proof per §6; the other two
  families are dropped for this corrected run, disclosed). Live open-universe API.
- Held-out phase-2: **`h1x`** (synthetic), entities {1,4,7,133,143} DISJOINT from
  the phase-1 set {25,6,445,94} → arm5a cannot cache-hit (R4 holds; verified
  Attempt 10: 0 violations, arm5a 0 cache hits, arm4 reuses on new ids).
- `M0 = 8`, `k = 5`, model `claude-sonnet-4-6` — UNCHANGED. M0 still NOT adjusted
  from observed data (the forking-paths prohibition stands).
- Run command: `run-sac-poc.sh --families pokeapi-pokedex --seeds 5 --m0 8 --model
  claude-sonnet-4-6 --reuse-level h1x --live` (all 7 arms).
- This amendment is committed BEFORE Run 2 launches.
