# GOAL P2 — Cross-eval product-flow proof

> Full spec for the overnight P2 goal. Referenced from the bootstrap
> prompt; this is the canonical version. Branch
> `goal4-p2-product-flow-cross-eval`.

## What you're proving

The substrate's cold-to-warm performance improvements generalise to a
real tool bundle that has NEVER been seen during Goal 4. SkillCraft
has established the substrate works on SkillCraft. P2 proves the
substrate is not eval-coded.

On a small non-SkillCraft eval, the substrate must produce:
1. ≥ 1 helper crystallises from a cold episode (e1)
2. ≥ 1 warm episode (e2/e3) discovers the helper through
   `df.d.ts` / `apropos` / `man` — NOT by being told its name
3. The warm episode calls the helper; the call appears in the
   trajectory
4. Total cost across warm episodes is lower than a matched
   no-substrate baseline

This is the defensive evidence Codex identified as "the single
strongest move": one archived, replayable non-SkillCraft product-flow
bundle with a matched no-substrate control.

## Current state (2026-05-17)

Head commit: `88083177`. Substrate state: same as P1.

The existing novel-tenant smoke is at
`src/observer/__smoke__/novel-tenant.ts`. It proves substrate
mechanics but is too rigged to count as evidence: stub 5-book
dataset, seeded summariser, runs the same snippet twice to force
convergence, warm snippet directly calls the helper by name. P2
MUST NOT do any of these.

Read in order:
- `experiments/experiment-history.md`
- `kb/docs/intent-shape-interface.md`
- `src/observer/__smoke__/novel-tenant.ts` (understand what to NOT
  do, and what setup mechanics are reusable)

## Architecture pieces

- `src/snippet/runtime.ts` — `DiskSnippetRuntime`; wraps source as
  async IIFE, injects `df.*` global, records trajectory
- `src/snippet/dfBinding.ts` — `buildDf()`; how `df.db`/`df.tool`/
  `df.lib` get exposed
- `src/observer/install.ts` — `installObserver`; hook into snippet
  runtime's `onTrajectorySaved`
- `src/observer/author.ts` — 5 helper template renderers; authoring
  chain in `authorFunction`
- `src/server/manifest.ts` — regenerates `df.d.ts`; renders learned
  vs primitive helpers
- `src/discovery/librarySearch.ts` — `apropos` scoring
- `src/cli/workspace.ts` — `datafetch mount`; the workspace primitive
- `bin/datafetch.mjs` — CLI entry

CHECK FIRST: read `kb/product-design.md` sections 1-7 for the
canonical `datafetch mount/run/commit` lifecycle. Even though kb is
out of date for SkillCraft, it IS accurate for the FinQA-flow that
P2 will use as the harness shape.

## Inviolable constraints

1. **No SkillCraft tool or task.** The tool bundle MUST be real (an
   actual HTTP API or local file system surface), not stubbed, not
   the SkillCraft Python bridge.
2. **No seeded helpers.** `lib/__seed__/` MUST be empty for the test
   tenant. Cold episode starts with zero learned interfaces.
3. **No hardcoded helper names in warm-episode prompts.** The agent
   must discover via:
   - `apropos "<intent words>"`
   - `cat <baseDir>/df.d.ts`
   - `man <helper-name>` after discovering it
   If the warm prompt mentions a learned helper name, the test is
   INVALID.
4. **No same snippet text** in cold and warm episodes. The warm
   episode must be a different question with the same underlying
   intent shape.
5. **No substrate modifications.** P2 is harness-only.
6. **Same Claude backend** (claude-sonnet-4-6 via claude-p) for both
   substrate-ON and substrate-OFF arms.
7. **No cheating the substrate-OFF arm** with a different prompt.
   Same prompts, same backend, same tasks — only difference is the
   `lib/` overlay state.

## Tool bundle choice

Use `jsonplaceholder.typicode.com` — real REST API, predictable JSON,
no auth, no rate limit:
- `GET /users` → list
- `GET /users/:id` → single user
- `GET /posts` → list
- `GET /posts?userId=:id` → filtered list
- `GET /comments?postId=:id` → filtered list

Wrap as `df.tool.jsonplaceholder.{getUsers, getUser,
getPosts, getPostsByUser, getCommentsByPost}` via a small adapter
(~80 lines). Do NOT pre-load this adapter as a learned helper. It's
a primitive tool bundle, like any new MCP integration.

## Execution plan (high parallelism)

### Phase 0 — Bootstrap (you, 15 min)
- Read docs + sources
- Verify `pnpm typecheck` + `pnpm test` green
- Verify network reachability to jsonplaceholder
- Run `lazyusage-check`

### Phase 1 — Build jsonplaceholder tool bundle (subagent 1, ~1 hour)
Spawn ONE general-purpose subagent:

> "Implement `src/eval/productFlow/jsonplaceholderTools.ts` exposing
> a `df.tool.jsonplaceholder.*` bundle via the same mechanism the
> SkillCraft tools use (study `src/snippet/dfBinding.ts` for the
> tool-call recording shape). Five tool methods: `getUsers`,
> `getUser({id})`, `getPosts({})`, `getPostsByUser({userId})`,
> `getCommentsByPost({postId})`. Each does a `fetch()` to
> jsonplaceholder.typicode.com and returns the parsed JSON wrapped
> as `{success: true, <payload-key>: ...}` so the substrate's
> success-envelope unwrap activates. Add 5s timeout + error
> handling returning `{success: false, error: '...'}`. Test each
> method standalone."

### Phase 2 — Design 3 tasks + gold answers (you + subagent 2 in parallel)

Tasks:
- **e1 (cold, simple):** "Fetch user with id=1 and return their
  name and email."
  Gold: `{name: "Leanne Graham", email: "Sincere@april.biz"}`
- **e2 (warm, similar):** "Fetch users with ids 2, 3, 4 and return
  their names and emails as an array."
  Gold: hand-write the 3 `{name, email}` objects from
  jsonplaceholder data
- **e3 (warm, multi-hop):** "Fetch user with id=1 and count the
  number of posts they have authored."
  Gold: `{userId: 1, postCount: 10}`

e2 should trigger crystallisation reuse: e1 calls `getUser`, e2
should crystallise something like a perEntityGet helper. e3 is
multi-hop (`getUser` → `getPostsByUser`); intent signature differs.

Subagent 2 (parallel with subagent 1):

> "Implement `src/eval/productFlow/runProductFlowMicroEval.ts`
> harness: creates a per-arm baseDir, registers the jsonplaceholder
> tool bundle, runs 3 episodes sequentially using
> `DiskSnippetRuntime` (study `src/eval/skillcraftFullDatafetch.ts`
> for the agent-spawn pattern). Per-episode artifact directories
> matching the SkillCraft layout (`workspace/`, `agent/`,
> `trajectory.json`). Two arms: `substrateOn` (full observer + lib
> cache + `df.d.ts` rendering) and `substrateOff` (no observer,
> empty lib, no learned-reuse prompt section). The Claude agent is
> spawned exactly as `runClaudeAgent` does. Harness writes
> `results.partial.json` compatible with `normalize-results.ts`.
> Test with dry-run of e1 on substrateOn."

### Phase 3 — Run 6 episodes (2 arms × 3 tasks, ~30 min)
Sequential within arm, parallel across arms via
`Bash run_in_background`:
```
pnpm tsx src/eval/productFlow/runProductFlowMicroEval.ts \
  --arm substrate-on \
  --out-dir eval/productFlow/results/p2-substrate-on-20260517

pnpm tsx src/eval/productFlow/runProductFlowMicroEval.ts \
  --arm substrate-off \
  --out-dir eval/productFlow/results/p2-substrate-off-20260517
```

### Phase 4 — Verify the discovery claim (you, 30 min)

CRITICAL: verify warm episodes (e2, e3) discovered the helper through
`df.d.ts`/`apropos`/`man`, NOT by name in the prompt. Inspect the
e2/e3 prompts sent to Claude. If the prompt mentions a helper name,
the test is INVALID; fix the harness and rerun.

Then verify the trajectory:
- `cat eval/productFlow/results/p2-substrate-on-.../episodes/e1/trajectory.json`
  → should show only `df.tool.jsonplaceholder.*` calls (no `df.lib.*`)
- Check `<baseDir>/lib/<tenant>/` → should have ≥ 1 `.ts` file
- `cat` the `.ts` file → verify it's a real learned helper
  (frontmatter YAML present, intent signature stamped, body
  parameterised)
- `cat eval/productFlow/results/p2-substrate-on-.../episodes/e2/trajectory.json`
  → should show ≥ 1 call to `df.lib.<helper-name>`

### Phase 5 — Produce the defensive-evidence artifact (you, 1 hour)
Write to `eval/productFlow/results/p2-defensive-evidence-20260517/`:

```
cold-prompt.md             (the e1 prompt as Claude saw it)
warm-prompt-similar.md     (e2 — must not mention helper name)
warm-prompt-multihop.md    (e3)
learned-helper.ts          (crystallised helper file, full content)
df.d.ts.before             (empty lib state)
df.d.ts.after              (post-crystallisation)
apropos-output.txt         (what the warm agent saw)
man-output.txt             (the `man <helper-name>` rendering)
trajectory-arm-on-e1.json
trajectory-arm-on-e2.json  (showing helper call)
trajectory-arm-on-e3.json
trajectory-arm-off-e1.json
trajectory-arm-off-e2.json
trajectory-arm-off-e3.json
comparison.md              (headline report — see Success criteria)
README.md                  (how to replay this bundle)
```

## Success criteria (progressive, not binary)

5 explicit claims:

- **Claim 1 — Crystallisation:** arm A's e1 → ≥ 1 helper file
  written. (PASS/FAIL; mechanics)
- **Claim 2 — Discovery:** arm A's e2 prompt does NOT mention the
  helper name; agent finds it via apropos/df.d.ts/man. (PASS/FAIL;
  VFS-as-discovery claim)
- **Claim 3 — Reuse:** arm A's e2 OR e3 trajectory contains a call
  to a `df.lib.*` helper. (PASS/FAIL)
- **Claim 4 — Performance:** arm A's total cost (sum effective
  tokens across e2+e3) < arm B's total cost. (PROGRESSIVE: report
  % reduction)
- **Claim 5 — Correctness:** all 6 episodes return correct answers
  (gold-answer match). (PASS/FAIL per episode; report per-arm pass
  rate)

Graduation:
- Claims 1, 2, 3 all PASS (mechanics work)
- Claim 5: both arms ≥ 5/6 correct (substrate doesn't break things)
- Claim 4 shows arm A advantage (any %; this is the
  substrate-helps-you evidence)

Strong: claim 4 shows ≥ 20% cost reduction.
Weak-but-valid: ≥ 5% reduction.
Neutral: ≤ 5% but claims 1-3+5 green — substrate WORKS and
TRANSFERS, just doesn't measurably save cost at this micro-scale.
REGRESSION (arm A costs more): honest too; means learning-loop
overhead exceeds benefit at this scale; characterise it.

## Output deliverable

The complete
`eval/productFlow/results/p2-defensive-evidence-20260517/` bundle
plus `comparison.md` with:
- Headline 5-claim verdict
- Per-episode arm A vs arm B table (cost, wall-clock, correctness,
  `df.lib` calls)
- Trajectory analysis: which tools called when, which learned
  helpers fired
- Crystallised helper file embedded (so report is self-contained)
- 2-paragraph interpretation
- "How to replay" instructions

PLUS update `experiments/EXPERIMENT_NOTES.md` with P2 entry.
PLUS update `experiments/STATUS.md`.

## Stop conditions

STOP and ESCALATE if:
- jsonplaceholder unreachable / slow > 10s (use a local mirror —
  bring JSON locally and serve via `file://` — but document it)
- Claim 2 (discovery) fails — warm prompt accidentally mentions
  helper name. Harness bug, not substrate; fix and rerun.
- Substrate change required (e.g. observer doesn't crystallise for
  jsonplaceholder shape) — surface to user; do NOT modify observer

STOP and DECLARE WIN if:
- Claims 1, 2, 3, 5 all PASS
- Claim 4 shows any arm A advantage (positive %)
- Bundle complete and archived
- `comparison.md` committed as
  `feat(goal4 p2): non-skillcraft product-flow proof + defensive evidence bundle`

STOP and DECLARE NEUTRAL if:
- Claims 1, 2, 3, 5 PASS but claim 4 ≤ 5% advantage or regression.
  Still archive the bundle; honest evidence the substrate works
  mechanically but doesn't save cost at this micro-scale.

## Reference paths

- `src/observer/__smoke__/novel-tenant.ts` (rigged smoke; do NOT
  copy its rigging)
- `src/eval/skillcraftFullDatafetch.ts` (runClaudeAgent pattern)
- `src/snippet/runtime.ts`
- `src/snippet/dfBinding.ts`
- `src/observer/install.ts`
- `src/server/manifest.ts`
- `src/discovery/librarySearch.ts`
- `kb/product-design.md` (sections 1-4 for canonical mount/run/commit)
- `experiments/experiment-history.md`
- `kb/docs/intent-shape-interface.md`
