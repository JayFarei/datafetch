# The Intent-Shape Interface Pivot (iter150+)

## TL;DR

Learned helpers' public call signature flipped from a data-shape contract
(`{entityValues, toolBundle, toolNames, paramName, sharedInput, ...}`) to
an intent-shape contract (`{intent, limit?}` plus a small number of
record-side hints). All planner/executor knobs that used to live in the
agent's call site now live in `Internal*Plan` types that the helper body
reads out of the same loose input object, but that the public types and
frontmatter never advertise.

The honesty-bar this pivot was forced into: an agent should not have to
know that the helper internally fans out over `toolNames[]` against a
`toolBundle`. Knowing those means the agent is doing the planner's job at
the call site, which is exactly the failure mode `kb/br/04` flagged for
the proto-Goal-3 substrate.

## Why The Pivot

Through iter149 the four fan-out helpers (`toolFanout`,
`recordToolFanout`, `recordToolEnrichment`, `toolFanoutEnrichment`) had
their full execution plan in the public input schema. A SkillCraft
trajectory's calling code looked like:

```ts
await df.lib.toolFanout({
  entityValues: ["AAPL", "MSFT"],
  toolBundle: "equities",
  toolNames: ["dailyClose", "weeklyHigh"],
  paramName: "ticker",
  sharedInput: { period: "1mo" },
});
```

That is not a learned interface. That is the agent re-stating the entire
execution plan and the helper being a thin trampoline. Three things go
wrong:

1. **R7 conditional reuse becomes meaningless** because the agent must
   already know `toolBundle`/`toolNames`/`paramName` before deciding to
   reuse the helper. The hard part is choosing those values; the helper
   contributes almost nothing.

2. **Cross-shape transfer (R9) becomes accidental** because the helper
   contract is parameterized by the data shape it was first observed on.
   A second family with `paramName: "country_code"` instead of `"ticker"`
   is a brand new contract, not a transfer.

3. **Frontmatter has to describe data plumbing instead of intent.** The
   description block ends up reading "pass `entityValues` as an array of
   strings or numbers..." which is content the agent already inferred
   from the schema. The frontmatter should describe *when* to use the
   helper, not *how* to dress its parameters.

Iter150-onward (the post-Codex-review honesty rewrite) split the surface:

- **Public input** = the intent. Examples: `{intent: "repeated tool fan-out", limit?}`,
  `{intent: "record-backed repeated fan-out", recordFilter?, recordLimit?}`.
  These are the fields the frontmatter advertises.
- **Internal plan** = a loose-object overlay (`Internal*Plan`) with
  `entityValues`, `toolBundle`, `toolNames`, `paramName`, `paramByTool`,
  `recordParamMapByTool`, `sharedInput`. The body casts
  `input as Input & InternalToolFanoutPlan` and reads these fields, but
  the public types never expose them and the frontmatter description
  never mentions them. They are populated by the upstream planner that
  resolves a learned helper invocation into a concrete execution plan.

This is the same separation Voyage AI's CodeMode paper (`kb/br/01`)
calls "execution vs interface."  The agent only sees the interface; the
substrate is responsible for filling the execution slots.

## The Five Current Helper Templates

Listed below in the order they appear in `src/observer/template.ts:309-323`.
Each one has a canonical `intentSignature` and a public input shape.

| Template | intentSignature | Public input |
|---|---|---|
| `toolFanout` | `FANOUT(tool)` | `{intent?: "repeated tool fan-out", limit?}` |
| `toolFanoutEnrichment` | `FANOUT(tool)→lib→FANOUT(tool)` | `{intent?: "repeated tool fan-out dependent enrichment", limit?}` |
| `recordToolFanout` | `db→FANOUT(tool)→lib` | `{intent?: "record-backed repeated fan-out", recordFilter?, recordLimit?}` |
| `recordToolEnrichment` | `db→FANOUT(tool)→lib→FANOUT(tool)` | `{intent?: "record-backed dependent enrichment", recordFilter?, recordLimit?}` |
| `recordToolLookup` | `FANOUT(db)→FANOUT(tool)` | (seed-only path, no separate authored template) |

`recordToolLookup` is currently a recognized intent signature
(`src/observer/template.ts:313-314`) and a topic
(`src/observer/template.ts:697-705`) but is not yet authored by its own
`render*Source` function. Its observed trajectories converge on the
recognised intent and currently land in the generic
`renderRecordToolFanOutSource` path (see
`src/observer/author.ts:301-318`).

The four authored render functions live at:

- `renderRecordToolFanOutSource` — `src/observer/author.ts:639-798`
- `renderRecordToolEnrichmentSource` — `src/observer/author.ts:802-1037`
- `renderToolFanoutEnrichmentSource` — `src/observer/author.ts:1039-1238`
- `renderToolFanOutSource` — `src/observer/author.ts:1239-1370` (approx)

Each renders an `fn<Input, unknown>(...)` block where `Input` is the
intent-shape and the body widens to `Input & Internal*Plan`.

## How `{intent, limit?}` Resolves Into A Call

When the agent emits `await df.lib.toolFanout({intent: "...", limit: 5})`,
the runtime does roughly:

1. **Snippet dfBinding** (`src/snippet/dfBinding.ts`) intercepts the
   `df.lib.toolFanout` lookup and returns the learned `fn(...)`'s
   `invoke` from `src/snippet/library.ts`.
2. **The wrapper's planner** has already populated the
   `InternalToolFanoutPlan` fields on the call's input object. The
   wrapper sees the merged `{intent, limit, entityValues, toolBundle,
   toolNames, paramName, ...}` and runs the body.
3. **Body** (rendered at `src/observer/author.ts:1315-1352`):
   ```
   const plan = input as Input & InternalToolFanoutPlan;
   const entityValues = Array.isArray(plan.entityValues) ? plan.entityValues : [];
   const toolBundle = typeof plan.toolBundle === "string" ? plan.toolBundle : "";
   ...
   if (!toolBundle || toolNames.length === 0 || !defaultParamName)
     return { error: "missing_internal_plan" };
   ```
   If the planner failed to populate the internal plan, the helper
   returns a structured `{error: "missing_internal_plan"}` value rather
   than throwing — this keeps the runtime-error rate (R3) clean while
   surfacing the failure for downstream gap analysis.

The valibot input schema uses `v.looseObject(...)`
(`src/observer/author.ts:1304-1313`) precisely so internal fields can
ride along on the input object without failing validation. The public
schema only requires `intent` and `limit` to be parseable; the loose
object lets the planner pass through whatever it needs.

## The Intent Signature Scheme

`intentSignature` is the data-shape-agnostic crystallisation key. It is
defined in `src/observer/template.ts:223-252` (the
`computeIntentSignature` function) with the offline reference impl at
`eval/skillcraft/scripts/intent-cluster-analysis.ts` (file header lines
1-25 explain the validation against full-126 + iter15).

The scheme:

1. Map each top-level call's primitive to a category: `db.*` → `db`,
   `lib.*` → `lib`, `tool.*` → `tool`, anything else dropped.
2. Collapse any contiguous run of ≥ 2 same-category calls into
   `FANOUT(category)`. Single calls stay as their bare category.
3. Join with `→`.

Degree is deliberately excluded from the key (see template.ts:217-222):
the learned fan-out helpers are parameterized over arbitrary entity
and tool counts, so a 3-entity invocation and a 7-entity invocation
should share an intent. Keeping degree in the key fragmented one
transferable intent into separate 3-5 and 6+ clusters during iter14
validation.

The known-helper short-circuit (template.ts:309-324,
`knownLearnedHelperIntentSignature`) is what makes a single
`lib.toolFanout` call resolve to `FANOUT(tool)` for clustering purposes
even though the top-level primitive sequence is just one `lib.*` call —
the helper's *identity* tells us its semantic shape.

## The Five Helpers' Intent Signatures, Explicitly

```
toolFanout              → FANOUT(tool)
toolFanoutEnrichment    → FANOUT(tool)→lib→FANOUT(tool)
recordToolFanout        → db→FANOUT(tool)→lib
recordToolEnrichment    → db→FANOUT(tool)→lib→FANOUT(tool)
recordToolLookup        → FANOUT(db)→FANOUT(tool)
```

These five signatures cover the SkillCraft families the substrate has
been gated on through iter164. The clustering report
(`intent-clusters.json` per run) shows the long tail: clusters whose
signatures don't yet have a render function get held at gate by the
R6 convergence rubric until either (a) a new render function lands, or
(b) the cluster reduces to one of the existing five via sub-graph
extraction (`extractSubGraphTemplates` in template.ts:399-505).

## What The Public Frontmatter Now Looks Like

Per `fanOutFrontmatter` (`src/observer/author.ts:1999-2026`), the
frontmatter for `toolFanout` reads:

```yaml
name: toolFanout
status: provisional
description: |
  Transferable learned datafetch fan-out helper for repeated per-entity tool calls.
  Use when the task has an entity set and needs the same tool bundle plus
  one or more tool names called for each entity. The caller-facing input is
  intent-shaped: { intent?: "repeated tool fan-out"; limit? }.
  Planner/executor internals infer entity values, tool names, and tool params
  before invoking the runtime implementation.
trajectory: <id>
shape-hash: <hash>
```

Nothing in that description tells the agent which tool bundle to choose
or how to flatten entity values. The agent's call site only states
*what* it wants done; the planner figures out *how*.

## Trade-Offs The Pivot Makes Explicit

**Win:** R7/R8/R9 become meaningfully measurable. A helper that the
agent calls with only `{intent}` is genuinely transferable across
families with different data shapes, because the agent never had to
type a family-specific param name. Iter161+ R9 hits at least one
intent reused across ≥ 2 families precisely because of this.

**Cost:** the planner is now doing what the prompt used to do. The
old direct-shape interface let the agent's prompt do the work of
naming `toolBundle`, `toolNames`, `paramName`. The new intent-shape
interface puts the planner on the hook for that resolution, and the
substrate has to either:

- Maintain a learned planner that maps intent + episode context to a
  concrete `Internal*Plan`, OR
- Accept `{error: "missing_internal_plan"}` returns when the planner
  can't resolve, which propagates into runtime metrics.

Today the planning step is partial — the wrappers emit explicit
`missing_internal_plan` errors when the internal fields aren't supplied
(see e.g. `src/observer/author.ts:1321-1323`). The signal these errors
generate is what surfaces in `helper-instrumentation.jsonl` as
"called but produced no value" and feeds the iter165+ planning work.

**Honesty:** the intent-shape interface is more honest, but it is *less
ergonomic* for the substrate today. The planner's TODO list is now
visible — every `missing_internal_plan` is a frame the planner doesn't
yet fill correctly. The old interface hid this by making the agent the
planner.

## Where The Pivot Touches Files

| File:line range | What changed |
|---|---|
| `src/observer/template.ts:197-324` | `computeIntentSignature` plus known-helper signature map |
| `src/observer/author.ts:639-798` | `renderRecordToolFanOutSource` — intent-shape rewrite |
| `src/observer/author.ts:802-1037` | `renderRecordToolEnrichmentSource` — intent-shape rewrite |
| `src/observer/author.ts:1039-1238` | `renderToolFanoutEnrichmentSource` — intent-shape rewrite |
| `src/observer/author.ts:1239-1370` | `renderToolFanOutSource` — intent-shape rewrite |
| `src/observer/author.ts:1934-2120` | Frontmatter / headerComment / intentString — public description copy |
| `src/snippet/dfBinding.ts` | `df.lib.*` resolution path (loose-object input pass-through) |
| `eval/skillcraft/scripts/intent-cluster-analysis.ts` | Offline reference implementation of the same signature scheme |
| `src/eval/skillcraftFullDatafetch.ts:3587` | Recognises the three record-side learned helpers in the planner stub |

## What Still Owes Honesty

- `recordToolLookup` (`FANOUT(db)→FANOUT(tool)`) has the signature
  recognised but no dedicated render function. The closest authored
  helper is `recordToolFanout`, which is what gets emitted today when
  the intent is detected.
- The planner that populates `Internal*Plan` fields is, in iter164,
  driven by an explicit task-side stub
  (`src/eval/skillcraftFullDatafetch.ts:3587-3640`), not by a learned
  policy. That stub is the next thing to fold into the loop honestly
  (paper 6's "compositional skill" framing — see
  `../../experiments/post-iter164-research.md`).
