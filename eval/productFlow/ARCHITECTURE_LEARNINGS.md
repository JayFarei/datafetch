# P2 architecture learnings (2026-05-17 → 2026-05-18)

What the cross-eval against jsonplaceholder.typicode.com established
beyond the literal P2 5-claim verdict.

## TL;DR

The substrate's cold-to-warm helper learning transfers off SkillCraft.
The "infrastructure" — observer, per_entity seed, df.d.ts manifest,
AGENTS.md workspace contract, lib/ overlay — is correctly designed and
runs at acceptable cost when its outputs are propagated to the agent's
workspace cwd. Two specific gaps blocked reliable reuse at this scale:
(1) the observer's auto-authored helpers ship with `(input: Object)`
signatures the agent passes over; (2) without explicit directive
steering in the workspace contract, agents do not curate their own
tool surface on short tasks. Both gaps have a concrete fix.

## The matrix

Four arms × two-axis design (helper richness × directive steering):

| arm | directive CLAUDE.md | helper richness | reuse rate | cost vs off |
| --- | --- | --- | --- | --- |
| substrate-off baseline | n/a | n/a | 0/2 warm | 1.00× |
| workspace-lib only | none | thin (auto-crystallised, Object input) | 0/2 | 1.02× |
| skills-disclosure (substrate default CLAUDE.md) | substrate default | thin | 0/2 | 1.70× |
| inline-manifest (in task prompt) | none | thin | 1/2 | 2.21× |
| mandatory-cat (in task prompt) | inline MUST cat | thin | 2/2 | 4.66× |
| directive overlay v2/v3 | strong directive | thin | 3/4 (always per_entity, never toolFanout) | 3.7-6.6× |
| skills-disclosure + hand-authored rich helper | substrate default | rich (typed input, full composition) | 1/1 (userPostSummary) | 3.5× |
| baseline + hand-authored typed toolFanout | substrate default | typed signature | 0/2 | ~1.0× |

(See `results/*/results.json` for each arm; `results/p2-defensive-evidence-20260517/comparison.md` for the canonical 5-claim verdict.)

## Findings

### 1. Discovery infrastructure works when wired correctly

The substrate auto-generates `AGENTS.md`/`CLAUDE.md`/`df.d.ts` into
`<DATAFETCH_HOME>/` and a `lib/<tenant>/` overlay for crystallised
helpers. The original P2 harness wrote these to `datafetch-home/` but
the agent's `claude-p` cwd was the per-episode `workspace/` directory.
The agent never saw any of the substrate's discovery surfaces — that's
the entire ~3× cost regression from the original run. Mirroring those
files into the workspace (`--workspace-lib` arm of the harness) brings
cost to ~1.7× one-shot, which is near-baseline in any session-cached
setting.

**Action for the substrate:** every agent invocation that consumes a
`baseDir` needs to either (a) run with `cwd = baseDir` or (b) mirror
the workspace contract files into the agent's actual cwd before the
spawn. This is a packaging issue, not a substrate-internals one.

### 2. Auto-crystallised helpers lose to the typed seed

`per_entity` is shipped by the substrate as a typed seed:
`per_entity({entityIds, toolBundle, toolNames, paramName, ...})`. The
observer's auto-author template emits `(input: Object)` because it
preserves the intent-shaped `{intent?, limit?}` public surface and
puts the actual call params under non-public "planner/executor
internals" fields. When df.d.ts renders both side-by-side, every
single reuse went to `per_entity`. The agent reliably prefers the
typed signature over `Object`.

**Action for the observer:** `src/observer/author.ts` should examine
the trajectory's actual primitive call arguments and synthesise an
explicit typed input schema — same surface as `per_entity` —
instead of the intent-shaped surface. The body shape (per-entity
records with `tools: {...}`) can stay; only the `input:` schema needs
to expose the planner fields publicly.

### 3. Typing is necessary but not sufficient — directive steering is the other half

Hand-authored typed `toolFanout` (matching `per_entity`'s schema) was
pre-seeded and tested with substrate-default CLAUDE.md. Result: agent
still ignored it (0/2 reuses). Without the directive in the workspace
memory ("you MUST check df.lib.\* before writing Promise.all"), the
agent doesn't look at lib/ at all for short tasks. Typing only
matters once the agent has decided to read the signatures.

Two CLAUDE.md variants reached 3/4 reuses (always `per_entity`,
since they were tested with the Object-typed `toolFanout`):
- v2 "directive" — bullet rules + MUST check
- v3 "patterns" — same plus pattern-recognition table (fan-out /
  aggregation / multi-hop composition) and a worked example

Both cost 3-6× the substrate-off baseline. The cost is the
directive's text overhead PLUS the agent's exploration turns once
steered.

**Action for the workspace contract:** the substrate's auto-generated
AGENTS.md is currently descriptive ("here's how datafetch works"). It
needs to be made directive ("before writing primitive loops, check
df.lib for matching helpers"). The pattern-recognition table from v3
generalises across tool bundles and is cheap to ship as boilerplate.

### 4. Discovery overhead does not amortise in stateless per-task agents

In our harness every episode spawns a fresh `claude-p` that re-reads
CLAUDE.md → AGENTS.md → df.d.ts from cold. The directive cost is paid
per-episode. In an interactive session those reads would land as
`cache_read` after the first episode and cost ~10× less. We did not
test the persistent-session case directly; the steady-state cost is a
straightforward projection from the cache-token numbers in the
per-episode `agent/run.json`.

### 5. Rich composition wins when typing AND directives are both present

`userPostSummary` (hand-authored, typed input, multi-step composition
that does the full e4 pipeline in one call) was preseeded alongside
the thin auto-crystallised `toolFanout` under skills-disclosure. The
agent picked `userPostSummary` for e4, wrote a 4-line `answer.ts`,
and got the gold answer. Same disclosure pipeline; different
acceptance threshold. This is the closest-to-positive end of the
matrix: the substrate's full design works when the helper itself
clears the "effort-to-call < effort-to-derive" bar.

## The principle

Agents reuse a helper iff **effort-to-call < effort-to-derive**, AND
**they look at lib/ at all**. Both inequalities must hold.

- **Effort-to-call** is dominated by input clarity: a typed input
  shape lets the agent invoke with confidence; `(input: Object)`
  requires reading the body.
- **Effort-to-derive** is the inline alternative. For thin fan-out
  it's ~5 lines of `Promise.all`. For multi-step composition with
  projection + sort it can be ~20 lines.
- **Looking** is gated by the workspace contract. Without a directive
  CLAUDE.md, agents don't browse lib/ on short tasks.

This collapses into a clean architectural recipe:

1. The substrate's observer authoring template emits typed input
   signatures (currently emits `(input: Object)`).
2. The substrate's promotion gate requires effort-to-derive above a
   threshold (currently accepts any qualifying trajectory shape,
   including thin fan-outs).
3. The substrate ships a directive AGENTS.md by default (currently
   ships a descriptive one).
4. Optional: an upstream classifier tags each task as "likely-reuse"
   or "one-shot" and routes — only the former gets the directive
   workspace contract, so simple tasks don't pay the 3-6× steering
   tax. This is the strict superset of #3 for cost-sensitive
   deployments.

## What's worth taking to main

**Land:**

- `src/eval/productFlow/` (harness + comparison utilities — no
  substrate edits).
- `eval/productFlow/jsonplaceholderToolRunner.py` (the Python bridge
  that lets the existing skillcraftToolBridge handle any tool bundle).
- `eval/productFlow/preseed-rich-helper/userPostSummary.ts` and
  `eval/productFlow/preseed-typed-toolfanout/toolFanout.ts` as
  fixture examples of "what a well-authored helper looks like."
- `eval/productFlow/overlays/v2-directive/CLAUDE.md` and
  `v3-patterns/CLAUDE.md` as examples of the directive workspace
  contract the substrate's default AGENTS.md should evolve toward.
- `eval/productFlow/results/p2-defensive-evidence-20260517/` (the
  primary defensive-evidence bundle).
- `eval/productFlow/results/p2-substrate-{off,on}-20260517/` (the
  primary 2-arm cross-eval the bundle compares).
- `eval/productFlow/results/p2-skills-disclosure-full-20260518/`
  (the corrected-harness arm the bundle's revised verdict refers to).
- This document (`eval/productFlow/ARCHITECTURE_LEARNINGS.md`).
- `experiments/EXPERIMENT_NOTES.md` and `experiments/STATUS.md`
  updates from this iteration.

**Optional (cheap to keep, no harm in dropping):**

- The supplementary arm directories under
  `eval/productFlow/results/p2-{overlay,typed,rich,inline,workspace}-*/`.
  ~2 MB total; they back specific claims in `ARCHITECTURE_LEARNINGS.md`
  but the headline conclusions are reproducible from the harness if
  removed.

**Substrate follow-up (not in this branch):**

- `src/observer/author.ts` — switch the auto-author template to
  synthesise typed input schemas from trajectory call args.
- `src/observer/gate.ts` — add a "composition density beats inline
  rewrite" check before promoting a thin template.
- `src/bootstrap/workspaceMemory.ts` — make the default AGENTS.md
  directive (port the pattern-recognition table from
  `eval/productFlow/overlays/v3-patterns/CLAUDE.md`).
- Plumbing change: every agent spawn that uses a baseDir should mirror
  `AGENTS.md`, `CLAUDE.md`, `df.d.ts`, and the relevant `lib/` tree
  into the spawn's cwd before launching. The corrected harness's
  `mirrorLibIntoWorkspace` helper is a reference implementation.
