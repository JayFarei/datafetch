# Phase 1 Demo — learning in the interface (honest, evidence-backed)

> Phase-1 deliverable: a demo artifact showing (1) df.d.ts evolving across
> sessions, (2) the warm-path source collapse, and (3) the governance gate
> declining a bad helper. Every panel below is REAL output from the committed
> run / probes / ceiling-probe, not a mock. Where the measured result is
> negative (warm-path), this demo says so plainly: see
> [`PHASE-1-FINDINGS.md`](./PHASE-1-FINDINGS.md) for the headline null.
> Date: 2026-06-03. Branch: `sac-poc-build`.

Datafetch is positioned against the ephemeral re-derivation regime (Search as
Code re-derives each session and keeps nothing): datafetch instead OBSERVES a
trajectory, GOVERNS a candidate helper, and PERSISTS it into a typed code
surface (`df.d.ts`) that the next session inherits. This demo shows that
machinery working, and is honest about where it pays off and where it does not.

---

## Panel 1 — df.d.ts evolves across sessions (the learning is real and typed)

The agent writes TypeScript against a generated `df.d.ts`. As it solves
questions, the observer crystallises a reusable helper and the manifest
regenerates, so a LATER session sees a callable it did not have before.

Real evidence from `arm4/seed-1` of the confirmatory run
(`eval/skillcraft/results/sac-poc/confirm-k5-pokeapi-h1x/`), counting
occurrences of the learned helper `toolFanout` in each session's `df.d.ts`:

| Session (phase-1 order) | `df.lib.toolFanout` in df.d.ts? |
|---|---|
| `e1` (first session) | absent (0) — only the cold-start `per_entity` seed exists |
| `m2` (later session) | present (1) — crystallised and now callable |
| phase-2 `h1x` (next phase, frozen) | present (1) — persisted across the session boundary |

The learned signature, as it actually appears in the frozen phase-2 df.d.ts:

```ts
// df.lib, frozen phase-2 interface (arm4/seed-2/phase2/.../h1x/workspace/df.d.ts)
"toolFanout"(input: { intent?: "repeated tool fan-out"; limit?: number }):
  Promise<{ value: any; cost?: any; provenance?: any; escalations?: number }>;
```

This is the cross-session persistence pillar: the helper is absent in session 1,
present by a later session, and inherited (frozen) by the next phase. That is
the concrete difference from the ephemeral regime.

Reproduce:
```bash
R=eval/skillcraft/results/sac-poc/confirm-k5-pokeapi-h1x/arm4/seed-1
grep -c toolFanout "$R/phase1/episodes/pokeapi-pokedex/e1/workspace/df.d.ts"   # 0
grep -c toolFanout "$R/phase1/episodes/pokeapi-pokedex/m2/workspace/df.d.ts"   # 1
```

---

## Panel 2 — warm-path source collapse (honest: conditional, NOT on the measured run)

The intended payoff: once a helper is learned, the warm session writes far less
code because the expensive glue lives behind the helper.

**On the measured pokeapi fan-out (the real run): NO collapse.** The crystallised
`toolFanout` was shallow and effectively non-invocable as a cost saver: arm4's
warm `answer.ts` was as long or LONGER than arm1's inline version, and arm4 cost
MORE in every token unit (see the cost-frontier figure and findings). This is
the honest headline negative.

**In the deep-helper regime (the $0 ceiling probe): collapse DOES happen.** When
the helper is DEEP and INVOCABLE (the whole per-entity DAG: parallel
details/species, chain_id to evolution, moves, abilities, field extraction lives
inside `df.lib.pokedexEntries`), the warm `answer.ts` collapses to just the call
+ aggregation + emit:

```ts
// ceiling-probe/answer_deep.ts — 29 lines vs the arm1 inline baseline 72 lines
const pokemon = (await df.lib.pokedexEntries({ ids: ["1","4","7","133","143"] })).value;
const total_moves = pokemon.reduce((s, p) => s + p.move_count, 0);
const output = { pokemon, summary: { /* avg_base_stat_total, total_moves, ... */ }, analysis_date: "2026-06-03" };
await writeJson("pokedex_entries.json", output);
df.answer({ status: "answered", value: output, evidence: pokemon, derivation: ["df.lib.pokedexEntries({ids}) -> aggregate summary"] });
```

Source collapses from 72 inline lines to 29, and the governance gate clears the
deep helper (see `ceiling-probe/CEILING-PROBE.md`). So the warm-path collapse is
REAL but CONDITIONAL: it requires a deep, invocable helper on serial-dependency
DEPTH work. On shallow per-entity fan-outs (the measured corpus) there is
nothing expensive to hide, so inline re-derivation wins. This boundary is the
core Phase-1 finding.

Reproduce:
```bash
wc -l experiments/2026-06-sac-poc/ceiling-probe/answer_deep.ts          # 29
cat   experiments/2026-06-sac-poc/ceiling-probe/CEILING-PROBE.md
```

---

## Panel 3 — the governance gate declines a bad helper (the verification pillar)

A persisted helper is only safe if a gate refuses to promote one that is stale,
under-parameterised, or wrong. The frozen gate
(`src/observer/quarantineValidator.ts`) replays a candidate against a held-out
sibling trajectory and DECLINES on mismatch. arm2 (gate on) declines; arm3 (gate
off) would emit the wrong/stale value. Live output from the deterministic probes:

```text
[PASS] wrong-sibling:       gate DECLINED  arm2 DECLINES | arm3 EMITS 3000 (held-out gold 3290.62)
[PASS] under-parameterised: gate DECLINED  arm2 DECLINES | arm3 EMITS 1280 (held-out gold 1300)
[PASS] source-drift:        gate DECLINED  arm2 DECLINES | arm3 EMITS 1000 (held-out gold 1750)
[PASS] nonnumeric-accept:   gate PROMOTED  (string-answer helper validated — Phase-2 #1 dataset-neutral gate)
PASS: all 4 deterministic governance probes met the pre-registered expectation.
```

The first three show the gate catching a bad helper; the fourth shows the
Phase-2 generalisation (the gate now validates a non-numeric helper, not just
numeric). Blind 20+20 mutant/valid suite: 0 false-accept / 0 false-reject.

And the Phase-2 (b) verification, the maturity flip itself: with a hook registry
installed, that same non-numeric (string-answer) helper is promoted all the way
to `validated-typescript` maturity and becomes callable, purely in-process (no
LLM / live run). This is the dataset-neutral governance loop end to end: gate
validates a non-numeric helper -> registry promotes it -> callable.

Reproduce:
```bash
npx tsx eval/skillcraft/scripts/run-governance-probes.ts          # 4/4 + blind 0/0
npx vitest run tests/sac-nonnumeric-maturity.test.ts              # non-numeric -> validated-typescript
```

---

## Cost-frontier figure

See [`figures/cost-frontier.svg`](./figures/cost-frontier.svg) (generated from
the real `score.json` by `figures/make-cost-frontier.mjs`; renders in any
browser). It plots cumulative full-weight model-context tokens vs warm-reuse
sessions M. arm4 (build cost 143,928 + 235,098/session) diverges ABOVE arm1
(168,577/session) because arm4's per-session slope is steeper, so the lines
never cross: M* = +Infinity. All three cost units agree (full-weight gap
-66,521; fresh+output -97; dollar-equivalent -6,740).

## Verification gates (this checkout)

```text
pnpm typecheck  -> exit 0
pnpm test       -> exit 0   (50 files / 424 tests; 8 smokes pass, finchain-mount SKIPs gracefully)
governance probes -> 4/4 deterministic + blind 20+20 = 0 false-accept / 0 false-reject
```

## Honest bottom line

The learning machinery works end to end and is typed, persistent, and governed:
helpers appear in df.d.ts across sessions (Panel 1), source collapses when the
helper is deep and invocable (Panel 2, conditional), and the gate reliably
declines bad helpers (Panel 3). What is NOT supported on the measured corpus is
the cost-amortisation headline: on shallow fan-outs the warm path costs more
than cheap inline re-derivation (M* = +Infinity). The demo therefore shows a
working mechanism whose cost payoff is bounded to a regime we did not benchmark
live (deep, serial-dependency tasks), alongside two pillars that hold regardless
of cost: cross-session persistence and governance.
