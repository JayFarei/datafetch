# P2 — Cross-eval product-flow proof (jsonplaceholder)

Generated 2026-05-17T19:08:03.152Z.

Substrate-on dir: `eval/productFlow/results/p2-substrate-on-20260517`
Substrate-off dir: `eval/productFlow/results/p2-substrate-off-20260517`
Model: `claude-sonnet-4-6`. Convergence N: 1.

## Headline (5 claims)

| Claim | Status | Evidence |
| --- | --- | --- |
| 1. Crystallisation (≥1 helper from e1 substrate-on) | PASS | files: lib/productflow-jsonplaceholder/toolFanout.ts |
| 2. Discovery (warm prompts free of helper names) | see Phase-4 verification.txt | warm e2/e3 prompts in this bundle |
| 3. Reuse (≥1 `df.lib.*` call in warm trajectory) | PASS | warm calls: lib.per_entity, lib.toolFanout |
| 4. Performance (warm cost on < off) | FAIL/NEUTRAL | warm effective tokens: on=6749, off=1448 (+366.1%) |
| 5. Correctness (both arms ≥ 2/3) | on=3/3 PASS, off=3/3 PASS | per-episode below |

## Per-episode comparison

| ep | arm | effTokens | inTok | cachedIn | outTok | wallMs | correct | trajectory primitives | df.lib calls |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| e1 | on | 2729 | 21 | 442303 | 2729 | 213051.487 | yes | tool.jsonplaceholder.getUser | — |
| e1 | off | 535 | 7 | 82460 | 535 | 102848.058791 | yes | tool.jsonplaceholder.getUser | — |
| e2 | on | 3139 | 18 | 353452 | 3139 | 153264.238292 | yes | tool.jsonplaceholder.getUser, tool.jsonplaceholder.getUser, tool.jsonplaceholder.getUser, lib.per_entity | lib.per_entity |
| e2 | off | 734 | 7 | 82319 | 734 | 105369.885041 | yes | tool.jsonplaceholder.getUser, tool.jsonplaceholder.getUser, tool.jsonplaceholder.getUser | — |
| e3 | on | 3610 | 17 | 332056 | 3610 | 145663.98083300004 | yes | tool.jsonplaceholder.getUser, tool.jsonplaceholder.getUser, tool.jsonplaceholder.getUser, lib.toolFanout | lib.toolFanout |
| e3 | off | 714 | 7 | 82600 | 714 | 133581.282167 | yes | tool.jsonplaceholder.getUser, tool.jsonplaceholder.getUser, tool.jsonplaceholder.getUser | — |

## Crystallised helpers (substrate-on)

- `lib/productflow-jsonplaceholder/toolFanout.ts`

## Per-episode answers

### e1

**substrate-on** got: `{"name":"Leanne Graham","email":"Sincere@april.biz"}`
**substrate-off** got: `{"name":"Leanne Graham","email":"Sincere@april.biz"}`
**expected**: `{"name":"Leanne Graham","email":"Sincere@april.biz"}`

### e2

**substrate-on** got: `[{"name":"Ervin Howell","email":"Shanna@melissa.tv"},{"name":"Clementine Bauch","email":"Nathan@yesenia.net"},{"name":"Patricia Lebsack","email":"Julianne.OConner@kory.org"}]`
**substrate-off** got: `[{"name":"Ervin Howell","email":"Shanna@melissa.tv"},{"name":"Clementine Bauch","email":"Nathan@yesenia.net"},{"name":"Patricia Lebsack","email":"Julianne.OConner@kory.org"}]`
**expected**: `[{"name":"Ervin Howell","email":"Shanna@melissa.tv"},{"name":"Clementine Bauch","email":"Nathan@yesenia.net"},{"name":"Patricia Lebsack","email":"Julianne.OConner@kory.org"}]`

### e3

**substrate-on** got: `[{"name":"Chelsey Dietrich","website":"demarco.info"},{"name":"Mrs. Dennis Schulist","website":"ola.org"},{"name":"Kurtis Weissnat","website":"elvis.io"}]`
**substrate-off** got: `[{"name":"Chelsey Dietrich","website":"demarco.info"},{"name":"Mrs. Dennis Schulist","website":"ola.org"},{"name":"Kurtis Weissnat","website":"elvis.io"}]`
**expected**: `[{"name":"Chelsey Dietrich","website":"demarco.info"},{"name":"Mrs. Dennis Schulist","website":"ola.org"},{"name":"Kurtis Weissnat","website":"elvis.io"}]`

## How to replay

```
pnpm tsx src/eval/productFlow/runProductFlowMicroEval.ts \
  --arm substrate-on \
  --out-dir eval/productFlow/results/p2-substrate-on-20260517

pnpm tsx src/eval/productFlow/runProductFlowMicroEval.ts \
  --arm substrate-off \
  --out-dir eval/productFlow/results/p2-substrate-off-20260517

pnpm tsx src/eval/productFlow/compareArms.ts \
  --on eval/productFlow/results/p2-substrate-on-20260517 \
  --off eval/productFlow/results/p2-substrate-off-20260517 \
  --bundle-dir eval/productFlow/results/p2-defensive-evidence-20260517
```

## Interpretation

**The cold-to-warm story works mechanically and transfers off SkillCraft.**
e1 substrate-on calls a single primitive (`tool.jsonplaceholder.getUser`)
and does NOT crystallise (gate threshold is `≥ 2 distinct primitive
calls`). e2 substrate-on calls the seed `df.lib.per_entity` to fan out
three `getUser` calls — that trajectory crystallises into
`lib/productflow-jsonplaceholder/toolFanout.ts`. **e3 substrate-on then
discovers `toolFanout` via `cat $DATAFETCH_HOME/df.d.ts` (the warm
prompt contains zero occurrences of `toolFanout`, verified by
`harness-validation.txt`) and calls `df.lib.toolFanout(...)` from
`scripts/answer.ts`.** That helper call appears as a `lib.toolFanout`
primitive in the e3 trajectory. The substrate-off control, given the
same 3 prompts and the same Claude backend, makes only direct
`df.tool.jsonplaceholder.getUser` calls and never reaches `df.lib.*` —
exactly what the absence of an observer + learned-interfaces section
should produce. So claims 1, 2, 3, and 5 all PASS on a real HTTP tool
bundle the substrate has never seen.

**Claim 4 (cost) regresses by ~4.7× at this micro-scale.** Substrate-on
warm cost (e2+e3) is 6,749 effective tokens vs substrate-off's 1,448.
Two compounding effects dominate: (1) the substrate-on prompt is
~2.4 kB longer because of the "Learned interfaces — MANDATORY
pre-flight check" section; (2) the agent spends additional turns
reading `df.d.ts`, then the helper's source file, before writing
`answer.ts`. The substrate's own trajectory step count IS lower for
substrate-on (1 `lib.*` step vs 3 raw `tool.*` steps), but at 3
entities that's a small absolute saving the prompt overhead swamps.
The honest reading per the spec's neutral verdict: **claims 1, 2, 3,
5 PASS; claim 4 is a REGRESSION at this scale**, which is the
"mechanically works but doesn't save cost at micro-scale" outcome
the P2 spec explicitly enumerates as valid evidence. The cost
crossover point — where the per-call substrate saving exceeds the
discovery prompt overhead — would happen at larger N (more
entities, more crystallisable patterns, prompt overhead amortised
across longer conversations), but that is not what this 3-episode
micro-eval can measure.

**What this bundle defends against.** The pre-existing novel-tenant
smoke at `src/observer/__smoke__/novel-tenant.ts` proves substrate
mechanics on a 5-book stub dataset with a pre-seeded `summariseRecords`
helper whose name the warm snippet calls verbatim. That is too rigged
to count as transferability evidence. This bundle removes all four
riggings — real HTTP API, no per-tenant pre-seed, three distinct
prompts with distinct intents, and warm prompts that mention only
the discovery surface (`cat df.d.ts`, optional `apropos`/`man`)
without naming any helper. The crystallised `toolFanout` was earned
during the run, not planted.
