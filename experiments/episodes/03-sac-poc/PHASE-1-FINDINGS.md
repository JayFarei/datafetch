# Phase 1 Findings — SaC-aligned PoC on SkillCraft

> Status: the pre-registered Phase-1 positive is EMPIRICALLY FALSIFIED on a
> sound harness, and is reported here as a rigorous negative result (not a
> defect, not a fabrication). Date: 2026-06-03. Branch: `sac-poc-build`.
> This is the honest synthesis; the append-only attempt trail is in
> [`RUN-LOG.md`](./RUN-LOG.md) (Attempts 6, 11, 12, 13).

## The pre-registered claim

From [`CONTRACT.md`](./CONTRACT.md) + [`PRE-REGISTRATION.md`](./PRE-REGISTRATION.md):
arm4 (frozen cross-session reuse) beats BOTH arm5a (memoization floor) and
arm5b (recipe floor) at non-inferior correctness, with a finite break-even
M\* whose 95% upper CI is at or below M0 = 8 sessions, over k>=5 interleaved
seeds on a pinned sonnet-4-6 snapshot. Positioned as datafetch vs the
ephemeral re-derivation regime, never a literal SaC head-to-head.

## What ran

Run 2 (VALID), output dir `confirm-k5-pokeapi-h1x/`: 210 episodes = 7 arms
x 5 seeds, pokeapi-pokedex, held-out new-argument level `h1x`, sonnet-4-6,
about 3h. At this point the harness was methodologically sound: arm1 vs arm4
prompt parity held (byte-identical except the binding line), the preseed
mandate fired (crystallise then reuse confirmed: arm2/arm4 reused the
crystallised `toolFanout`), and the two-phase fresh-process freeze worked.
Run 1 was invalid; three harness blockers (A: phase-blind arm4 binding,
B: held-out level not new-argument, C: parity body embedded df.d.ts) were
root-caused and fixed first (RUN-LOG Attempts 7-10).

## Result: the cross-session amortisation thesis is NOT supported

**M\* = +Infinity (CLEAN FAIL, denominator <= 0).** The arm4-vs-arm1 paired
marginal is negative in EVERY cost unit (arm4 warm costs MORE than arm1
inline re-derivation):

| Cost unit | arm1 inline | arm4 warm | paired denom (arm1 - arm4) |
|---|---|---|---|
| full-weight model-context tokens | 168,577 | 235,098 | **-66,521** |
| fresh + output (cache excluded) | 2,911 | 3,008 | **-97** (still negative, so not a cached-hydration artifact) |
| dollar-equivalent (cached x0.1) | 19,477 | 26,217 | **-6,740** |

**claimUpheld = false.** Attribution is `beatsBoth=true` on tokens but
`niToBoth=false`. The apparent token "win" over the floors is an artifact of
the floors re-fetching live while arm4 is LESS correct, not a real efficiency
gain.

**Correctness (held-out h1x):** arm4 2/5 vs arm1 4/5 (delta -33pp, NI not
established); arm5a 5/5, arm3 5/5. Overall pass across all levels: arm0 4/30,
arm1 27/30, arm2 26/30, arm3 28/30, arm4 21/30, arm5a 26/30, arm5b 27/30.
arm4, the headline warm-reuse arm, is the weakest non-arm0 arm.

(The run carried 15 R4 violations, all arm5a memoization-floor cache-hits from
an evolution-chain overlap in the h1x entity set. They are fixable and
immaterial to the headline: the arm4-vs-arm1 negative is parity-valid and
independent of the arm5a floor. See RUN-LOG Attempt 11.)

## Why (diagnosed, not hand-waved)

1. The crystallised `toolFanout` helper was SHALLOW and effectively
   non-invocable as a cost saver: warm output 2,998 is about equal to inline
   2,902, so calling it saved no writing, and arm4's `answer.ts` was actually
   LONGER (it still wrote evolution/abilities/aggregation inline). The
   learned-interface-call count was ceremonial.
2. The +66k full-weight gap is a TURN-COUNT tax, not hydration bloat:
   cached/request tokens are arm-invariant (about 36k); arm4 simply took about
   1.8 more turns. The 33-agent thesis-regeneration workflow (Attempt 12)
   refuted hydration-bytes, fan-out width, and governance-as-correctness on
   PokeAPI as recoverable levers, with regressions run on our own episodes.
3. For small per-entity fan-outs, inline re-derivation is already cheap. There
   is nothing to amortise.

This extends the previously conceded single-session null (frontier models do
not benefit from small-composition reuse) to the cross-session case.

## What IS established (the honest positives)

- A methodologically sound 7-arm paired-differencing harness: parity gate,
  preseed mandate, two-phase fresh-process freeze, clustered bootstrap CI,
  clustered-by-question McNemar NI, full-weight + dollar cost ledger. Green:
  `pnpm typecheck` exit 0, unit tests 424/424, governance probes 4/4 + blind
  20+20 = 0 false-accept / 0 false-reject.
- The governance gate works and is now dataset-neutral (Phase 2 #1 + #2
  gate-half): it promotes idempotent+generic helpers, declines stale or
  non-generic ones (3 adversarial probes), and now handles non-numeric answers
  and string/boolean inputs (commits 3a89637b9 / 28c442158 / 27668b7c7 /
  f43f30dda).
- A $0 ceiling probe (Attempt 13, `ceiling-probe/`) shows the ONE regime where
  warm reuse plausibly wins: a DEEP, INVOCABLE helper on serial-dependency
  DEPTH tasks makes `answer.ts` 20 lines vs arm1's 72, and the gate clears.
  This is measured in TURNS, and is bounded out of LLM-cored regimes until a
  `df.llm.*` primitive ships.

## Surviving differentiators (from the thesis-regeneration workflow)

1. **Governance-under-staleness**: persisted+governed vs ungoverned-persistent
   under source drift, on a numeric corpus (screen for a real correctness
   signal first, since FinChain correctness is saturated).
2. **Zero-src dataset-onboarding SDK** (highest promise; sidesteps the token
   diagnosis entirely). This is Phase 3.
3. **One narrow cost island**: a deep invocable helper on serial-depth tasks,
   measured in turns.

## Honest bottom line

The Phase-1 pre-registered positive (finite M\* <= 8 with arm4 beating both
floors at non-inferior correctness) is empirically falsified on a sound
harness and will not be fabricated. The scientifically honest Phase-1 output
is this rigorous negative, plus the sound harness and the three surviving
levers. How to position the program around this null (cost-island vs
governance-under-staleness vs SDK headline), and whether to formally reframe
the Phase-1 success criterion in light of the robust negative, is the user's
open decision (see RUN-LOG Attempt 11 options A/B/C/D and the consolidated
decision table at Attempt 19).

## Artifacts (honest Phase-1 deliverables, produced around the null)

- **Cost-frontier figure**: [`figures/cost-frontier.svg`](./figures/cost-frontier.svg),
  generated from the real `score.json` by the dependency-free
  [`figures/make-cost-frontier.mjs`](./figures/make-cost-frontier.mjs). Shows
  arm4 diverging above arm1 (M\* = +Infinity). Renders in any browser.
- **Demo artifact**: [`DEMO.md`](./DEMO.md) — three panels of REAL output:
  df.d.ts evolving across sessions, the conditional warm-path source collapse,
  and the governance gate declining a bad helper.
- **Verification gates** (this checkout): `pnpm typecheck` exit 0; `pnpm test`
  exit 0 (50 files / 424 tests; 8 smokes pass, finchain-mount SKIPs gracefully);
  governance probes 4/4 + blind 20+20 = 0 false-accept / 0 false-reject.

**Evidence pointers:** RUN-LOG Attempts 6 (run mechanics), 11 (the valid run +
numbers), 12 (thesis regeneration), 13 (ceiling probe), 21 (these artifacts).
Commits: `0665d5a27` (valid run), `a26d84647` (metric definition), `41e3eb77c` /
`1d5f7b05b` / `355747fb0` (blockers A/C/B). Run output: `confirm-k5-pokeapi-h1x/`.
