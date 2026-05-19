# Experiment notes (scratchpad) — Goal 5 (CRAG cycle)

> Chronological scratchpad. Real-time thoughts during goal mode. Lower bar to
> entry than EXPERIMENTS.md, much higher information density on what the
> agent was *thinking*, not just what the agent did. Use this file to audit
> reasoning and nudge direction if it drifts.

## Format

```
## YYYY-MM-DD HH:MM [stage]
<free-form note. include surprise, dead-ends, open questions, hypotheses that
didn't make it into PLAN.md, things that nagged at us. Keep it raw.>
```

Stages roughly map to:
- `hypothesis` (forming the iteration's hypothesis)
- `implement` (writing code)
- `probe` (running the single-domain probe)
- `validate` (running the held-out pair)
- `small-N` (running the 50-question probe)
- `full-crag` (running the 2,706-question eval)
- `skillcraft-regression` (re-running SkillCraft to gate the change)
- `analyze` (looking at results)
- `commit` (writing up + committing)
- `meta` (anything cross-cutting: process, tooling, plumbing)
- `BLOCKED` (an unresolvable tension — see the Goal 5 condition for the
  required fields when this stage is used)

---

## 2026-05-18, cycle setup

### 2026-05-18 22:30 [meta]

Cycle started. Goal 5 condition string registered via `/goal`. Worktree
created at `.claude/worktrees/eval+crag/` from `main` (commit
`ed2b6b5f3`). Branch `worktree-eval+crag`. (First attempt placed worktree
at `../df-goal5-crag` which violated the project's
`.claude/worktrees/<name>/` convention; recreated at the correct path before
any scaffold writes landed there.)

Carried over from the `decouple-substrate-from-skillcraft` branch state
(where the scouting + probe work happened in the preceding conversation):
- `kb/br/16-substrate-benchmark-scouting.md`
- `kb/br/17-crag-shape-probe-findings.md`
- `scripts/crag-probe/crag-shape-probe.ts`

The substrate state in this worktree is `ed2b6b5f3` (main), NOT the
`decouple-substrate-from-skillcraft` HEAD where br/17 was probed. Main is
behind by ~2,182 insertions including new `src/runtime/answerKit.ts`,
`src/runtime/toolCatalog.ts`, and modifications to observer/template/author/
install/gate. The first iteration must re-validate br/17's findings under
main's substrate state. If main authors a richer helper (because some of the
intermediate iter150-167 work is on `decouple-…` and not on main), the
br/17 gap list may be different.

Open question: should we eventually rebase `decouple-substrate-from-skillcraft`
into main (or cherry-pick the relevant pieces) so that Goal 5 work starts
from the most recent substrate state, not from the last main release? Leaving
this for the user to decide once iter1's re-probe data lands.

### 2026-05-18 22:35 [hypothesis]

Iter1 hypothesis: br/17's three findings (FANOUT(tool) signature collapse,
literal data-shape-clone helper body, helper-name-collision silent skip) all
replicate on main's substrate state. Lever is measurement-only; no substrate
change.

If they replicate → iter2 attacks the modeling decision (db.* vs tool.*).
If they don't → re-read main's observer to understand what changed, then
adjust the gap list.

### 2026-05-18 22:55 [probe]

Iter1 probe ran cleanly. ~30 seconds wall-clock end-to-end. No substrate
change, no LLM calls, no external deps. Output captured at
`eval/crag/reports/iter1-probe-output.txt`.

Identical shape-output to br/17 (compared row-by-row):
- A1 (Apple PE chain): intentSignature `FANOUT(tool)`, authored as `toolFanout.ts`
- A2 (MSFT PE — same tools): `FANOUT(tool)`, skipped `name already exists`
- A3 (MSFT cap — different metric): `FANOUT(tool)`, skipped
- B (comparison, 4 calls): `FANOUT(tool)`, skipped
- C (multi-hop): `FANOUT(tool)`, skipped
- D (false-premise, 1 call): `tool`, refused (< 2 calls)
- E (aggregation, 11 calls): `FANOUT(tool)`, skipped

`cat`'d the authored helper from the latest run's tmpdir. Identical body to
br/17 § Finding 3 — `{query, tickerName}` data-shape clone with hardcoded
`getTickerByName + getPeRatio` body, frontmatter still describes itself as
"reusable learned interface for the tool_fanout intent shape" which is
structurally false (it's a single-trajectory clone).

Helper invocation also reproduces br/17 § Finding 4: invoking with
`{query: "Microsoft", tickerName: "MSFT"}` fires warm (mode `interpreted`,
tier 2, 0 LLM calls) — correctness landmine intact. Calling it for a
market-cap question would return PE-ratio output silently.

### 2026-05-18 23:00 [analyze]

This is the (A) branch from the iter1 hypothesis. Implication: the substrate
gap is real and on main; iter2 attacks it as planned (mock-API modeling
decision: db.* vs tool.*).

Notable: zero LLM calls, zero external deps, ~30s wall-clock cost iter1.
The hand-authored probe pattern is high-leverage for substrate validation —
worth reusing for every "before we build an adapter, does the substrate
shape match what we'll need" question in subsequent cycles.

One small open question I'm parking: the helper's frontmatter `description`
makes a structurally-false claim ("reusable across entity/metric/period/
wording"). If we eventually fix the underlying issue (intent-shape pivot
fires on 2-call FANOUT(tool)), do we also retroactively rewrite frontmatter
on already-authored helpers? Probably yes — stale description on a corrected
body is a worse landmine than a clone body with a frank description.

### 2026-05-18 23:05 [commit]

About to commit iter1 with the EXPERIMENTS.md row + the probe-output artefact
+ this notes-file entry. No substrate change, so no SkillCraft regression
re-run needed for this iteration. Next iteration (E2) is the db.* modeling
probe.

## 2026-05-18, iter2 — db.* modeling

### 2026-05-18 23:30 [hypothesis]

iter2 tests br/16's recommendation (modeling CRAG mock APIs as
`df.db.cragFinance.companies.findExact(...)` rather than as
`df.tool.cragFinance.getCompanyInfo(...)`). Prediction was that db modeling
would route CRAG trajectories onto richer substrate shapes that match
existing render functions like `recordToolFanout`.

Wrote `scripts/crag-probe/crag-shape-probe-db.ts` — sibling of the original
probe but with 7 db-modeled trajectories. Added an extra trajectory (F:
enriched multi-hop, "What is the market cap of the company whose CEO is Tim
Cook?") to test the chain-dependent case explicitly.

Key modeling choice: I built collections as denormalised rich-row tables.
So `cragFinanceCompanies.findExact({name: "Apple"})` returns
`{name, ticker, pe_ratio, market_cap}` in one shot. This means simple
questions like "What is Apple's PE ratio?" become ONE-call trajectories
(agent extracts `.pe_ratio` locally). That's structurally fewer trajectory
calls but also fewer crystallisation opportunities.

### 2026-05-18 23:35 [probe]

Probe ran cleanly, ~5 seconds wall-clock. Three big findings vs iter1:

1. **Name collision DISAPPEARS.** Each 2-call trajectory gets a UNIQUE
   helper name derived from the question text. So instead of all
   trajectories trying to author `toolFanout.ts`, we get
   `whichHasHigherMarketCapAppleOrMic.ts`,
   `whoDirectedTheMovieThatWonBestPic.ts`,
   `whatIsTheMarketCapOfTheCompanyWh.ts` — three distinct files.

2. **1-call trajectories (4/7) are structurally outside crystallisation.**
   A1, A2, D, E all have a single db.findExact call; `extractTemplate`
   requires ≥ 2 calls, so no template. The substrate's learning loop fires
   for ZERO of the simple-chain CRAG question types under db modeling.

3. **Authored helper bodies are WORSE than iter1's clones.** Cat'd them.
   Helper B (comparison) input is `{name: string}` and body is a SINGLE
   findExact call. The comparison logic — fetch Apple AND Microsoft,
   compute max — is dropped entirely. Helper C (multi-hop) only renders the
   SECOND findExact call. Helper F (enriched multi-hop) likewise drops the
   first call. **The db-render path produces single-call bodies instead of
   full-trajectory bodies.** Iter1's `toolFanout` at least rendered both
   `getTickerByName` AND `getPeRatio`; iter2's db helpers drop half the
   trajectory.

### 2026-05-18 23:40 [analyze]

This is the wrong dichotomy. The choice isn't tool.* vs db.* — neither
produces useful crystallisation for CRAG alone. The real gaps are:

- **Gap A (signature scheme):** FANOUT(tool) and FANOUT(db) are both too
  coarse. Two different question shapes that produce the same signature get
  conflated (iter1) or get unique names with degenerate bodies (iter2).
  Need either finer-grained signature OR per-signature render-function
  coverage.

- **Gap B (render-function coverage):** the substrate has `toolFanout` /
  `toolFanoutEnrichment` / `recordToolFanout` / `recordToolEnrichment` /
  `recordToolLookup` — five templates. NONE of them match `FANOUT(db)` (no
  downstream tool/lib). The db-path falls through to a generic single-call
  rendering. Either add a `renderDbFanOutSource` OR refuse to author for
  unmapped signatures (cleaner failure mode).

- **Gap C (1-call crystallisation):** simple CRAG questions can't be
  crystallised at all under either modeling. To capture them, EITHER the
  substrate needs to crystallise sub-call patterns (local extraction
  logic), OR we accept that the substrate's CRAG win comes from the
  multi-call slices only (comparison, multi-hop, enriched).

Direction for iter3: explore HYBRID modeling. The cold call writes
`db.findExact → df.lib.someHelper(...)` where `someHelper` does the local
extraction. The second-call signature becomes `db→lib`. The substrate then
has a structurally richer pattern to crystallise from. Closest matching
existing template is `recordToolFanout` (`db→FANOUT(tool)→lib`) — but our
shape is `db→lib`, simpler. Worth checking whether this falls through to
the same degenerate single-call render, or whether `recordToolLookup`'s
`FANOUT(db)→FANOUT(tool)` family is closer.

Also worth a side-test: what happens if I author a hand-rolled SEED helper
(like the SkillCraft cycle's `df.lib.toolFanout` seed) and run the same
trajectories with the agent invoking the seed instead of writing raw db
calls? That tests whether the substrate's discover-and-reuse path even
fires when the helper exists pre-authored.

### 2026-05-18 23:45 [commit]

Iter2 is INCONCLUSIVE — solves name-collision, regresses body-fidelity,
same blind spot on 1-calls. No substrate change so no SkillCraft regression
needed. Next: iter3 hybrid modeling probe.

## 2026-05-19, iter3 + iter4

### 2026-05-19 00:00 [meta]

Iter3 (originally planned as hybrid db+lib modeling probe) replaced with
vendor work — the synthetic probes (iter1, iter2) have characterised the
substrate gap well enough; further synthetic iterations have diminishing
returns. Iter3 became "vendor the dataset" (PASSED, see E3 in EXPERIMENTS).

Most surprising finding from E3: the `popularity` field that br/16 cited
is NOT in the released `crag_task_1_and_2_dev_v4.jsonl` (empty for all
2,706 records). Likely lives only in CRAG's internal scoring rubric or in
task 3's combined split. Rubric updated.

### 2026-05-19 00:10 [implement]

Iter4: build the substrate-side adapter (CragWebMount) and run a smoke
that proves the snippet runtime composes against CRAG records. Two files:
- src/eval/cragMount.ts: parse + mount adapter + tri-state scorer (~190 lines)
- eval/crag/scripts/run-smoke.ts: 6-question hand-authored smoke (~260 lines)

Three implementation gotchas to remember for iter5+:

1. MountRuntime requires {mountId, adapter, identMap, collection, close},
   NOT the {capabilitiesCache, inventoryCache, resolveCollection, ...}
   shape I initially guessed. Use the shape from src/adapter/runtime.ts.

2. The AnswerEnvelope comes back on `RunResult.answer`, not
   `result.returnValue`. The snippet body needs `return df.answer({...})`
   to make it the resolved value of the IIFE wrapper.

3. MountAdapter requires:
   - `capabilities(): SourceCapabilities` (SYNC, not Promise<...>)
   - `probe(): Promise<MountInventory>` (not `inventory(): ...`)
   - `sample(collection: string, opts: SampleOpts)` (collection first arg)
   - `SourceCapabilities = {vector, lex, stream, compile}` — NO bm25/regex/changeStream fields
   - `CollectionInventoryEntry = {name, rows, fingerprint?, indexes?}` — NO recordCount/schema
   - `MountInventory = {collections: [...]}` — NO top-level mountId

### 2026-05-19 00:25 [probe]

Smoke ran cleanly. 6/6 questions returned the gold answer (because the
hand-authored snippet hardcodes it). Tri-state scorer:
- 5 +1 (exact match gold)
- 1 0 (false_premise question "when did hamburg become the biggest city
  of germany?" — gold answer is "invalid question" which the abstention
  patterns catch)
- 0 -1

This is plumbing-validation only. The +1s tell us the substrate's snippet
runtime correctly drove the df.db.cragWeb.search call, the answer envelope
came back with the right value, and the scorer matched against gold. The
0 tells us the abstention path works. The fact that none came back -1
proves the scorer isn't trigger-happy on the false-positive side.

### 2026-05-19 00:35 [skillcraft-regression]

No SkillCraft re-run needed for iter4. Substrate-runtime files
(src/observer/, src/snippet/, src/hooks/, src/sdk/, src/adapter/,
src/trajectory/) untouched. Only added src/eval/cragMount.ts which is
structurally isolated from the runtime. The 374/374 vitest + clean
typecheck on the same `ed2b6b5f3` substrate hash provide the equivalent
non-regression signal at zero API cost.

Iter5 — which introduces the claude-p driver — won't require substrate
changes either (the driver lives in the eval layer too). Iter6+ may
trigger substrate changes; those iterations will need full SkillCraft
re-runs.

### 2026-05-19 00:40 [commit]

About to commit iter4. Files: src/eval/cragMount.ts, eval/crag/scripts/run-smoke.ts,
eval/crag/results/smoke-iter4/smoke-report.json, and the EXPERIMENTS +
NOTES + STATUS updates.

Next: iter5 = claude-p driver. Mirror skillcraftFullDatafetch.ts's
runClaudeAgent (~70 lines for the driver itself; more for the
per-question workspace prep + prompt template + answer envelope parsing).
First end-to-end LLM-driven question. If it works, scale to small-N (50).

## 2026-05-19, iter6 — small-N matched-arm

### 2026-05-19 00:30 [implement]

Built three pieces in one go:
- `eval/crag/scripts/run-small-n.ts` — k=N parallel matched-arm runner
- `eval/crag/scripts/build-paired-comparison.ts` — McNemar + paired-t + 4-vector verdict
- Edits to `src/eval/cragRunner.ts` for the replay mutex

The race condition first surfaced in the workers=3 smoke: 1 question
completed in 134s, then the tsx parent hit 98% CPU for 14 minutes with no
live claude-p subprocesses. Killed and traced to `globalThis.df` overlay
contention.

The fix (process-wide `withReplayLock` mutex on the snippet replay phase)
is generic — it's a property of the snippet runtime's globalThis.df
pattern, not CRAG-specific. Same issue would hit any harness running
parallel `snippetRuntime.run` invocations. Worth a follow-up note in the
substrate's own docs: the snippet runtime is not reentrant on
globalThis.df. For now, keeping the mutex in cragRunner.ts (the consumer)
rather than touching the substrate.

### 2026-05-19 00:50 [smoke]

8 invocations (4 questions × 2 arms), all hit the 180s claude-p timeout.
Looking at the four questions selected (random first-4 by manifest order):
- f08ed2eb: "what was the price of inta at the end of the day yesterday?"
  (finance/simple/real-time) — agent can't possibly answer this without
  live data; cached 2024 pages don't have today's INTA close.
- d55e6e15: finance/simple_w_condition/static
- c7f3a697: finance/comparison/fast-changing
- adea74b3: finance/aggregation/static — gold "4"; agent answered "quarterly"

All finance, mostly dynamic/real-time. The agent's answer.ts for the
comparison question is EMPTY — claude-p was killed before the agent
finished writing. That's why score=0 (abstain): no answer to extract.

Predictably the full 50-record manifest will have better domain diversity
(8 each of finance/music/open/sports, 18 movie). Static questions should
dominate (1503/2706 = 55% of dataset), and most are answerable from
cached pages.

### 2026-05-19 01:00 [skillcraft-regression]

No SkillCraft re-run for iter6. cragRunner.ts is eval-layer code. The
substrate-runtime files (src/observer, src/snippet, src/hooks, src/sdk,
src/adapter, src/trajectory) remain bit-identical to ed2b6b5f3 (main).
pnpm test 374/374 still passes — same vitest suite that gates substrate
behavior. That's the equivalent non-regression signal at zero API cost.

### 2026-05-19 01:05 [commit]

Committing iter6 smoke as 4a631b0ca. Launching full small-N immediately
after (100 calls, ~100 min wall-clock budget). Monitor armed for
milestones (every 10 questions + summary).

### 2026-05-19 01:10 [meta]

Open question for iter7+: rule-based scorer is brittle. Saw it in iter5
(Nash's 2.2 may be more correct than gold's 4) and will keep biting on
ambiguous numerical / paraphrase answers. LLM-judge augmentation should
land — but it doubles per-question cost (another claude-p call per
question). Defer to iter7 after small-N gives us a baseline.

Other open question: substrate-ON has no way to win on the finance/
dynamic slice (no helper amortises across "today's INTA price" and
"today's Apple price" because the temporal-resolution path is the same).
Substrate value-add likely concentrates on static slice. Worth checking
per-dynamism breakdown in the small-N report.

## 2026-05-19 06:10 [BLOCKED]

**Blocked stage**: iter9 — exercising R7 on the CRAG harness.

**Goal 5 condition wedge that surfaced this block**: R7 helper-reuse
must fire on at least one sibling-template family. iter7-iter9c have
landed substantial generic substrate + harness fixes but R7 is still 0.

**Attempted paths (in order)**:
1. iter7 (commit `9b20afb97`): added generic `renderDbFanOutSource` to
   `src/observer/author.ts` + `dbFanout` entry in template.ts. Verified
   via synthetic probe (`crag-shape-probe-db.ts`) — substrate authors
   correct full-trajectory body. SkillCraft 1-task non-regression
   PASSED.
2. iter8 (commit `5312e5865`): per-family tenants in `cragRunner.ts`
   (`crag-on-<domain>-<questionType>`) so sibling questions share lib
   state. Eval-layer; no substrate change.
3. iter9a (commit `e2d4ee0e9`): updated AGENTS.md prompt to require
   2-4 targeted `df.db.cragWeb.search` calls per question. Verified —
   trajectories now have 3 calls each.
4. iter9b (UNCOMMITTED — in working tree): added `isPureDbFanout` to
   `src/observer/gate.ts` parallel to `isPureToolFanout`. Fixed two
   gate rejection points: (a) line 128 distinct-primitives check now
   accepts pure-db-fanout, (b) line ~306 downstream-lib check now
   accepts pure-db-fanout without requiring a `db.*→lib.*` boundary.
5. iter9c (UNCOMMITTED — in working tree): added `installObserver` call
   in `cragRunner.ts` for substrate-on arm (was MISSING entirely;
   without it the observer's onTrajectorySaved hook never fired).
   Lib directory now CREATES (proves gate is reaching), but stays
   EMPTY (authoring still rejecting somewhere downstream of the gate
   fixes).

**Evidence gathered**:
- Synthetic probe (`crag-shape-probe-db.ts`) authors helpers when calling
  authorFunction directly. Result confirmed in iter7 commit notes.
- Live harness (`run-iter8-sibling-probe.ts`) post-iter9c: lib directory
  `crag-on-crag-movie-simple/` is created (means installObserver wired
  + observer's onTrajectorySaved fires + gate runs) but no helpers
  authored. Q1 has 3 trajectory calls (passes isPureDbFanout). Three
  remaining suspects for the rejection:
    1. `extractCandidateTemplates` returns empty for our shape
       (worker.ts:169 "no template candidates extracted")
    2. Convergence gate (worker.ts:260, requires N=2+ trajectories of
       the same intent signature; this is by-design — first trajectory
       is recorded-but-not-crystallised). 3 sibling questions might not
       enough to trip the convergence count.
    3. shape-hash dedup (gate.ts:326) if a prior probe seeded something.

**Generic-vs-benchmark-specific tension**: NONE. All iter7-iter9c
substrate edits are generic. `isPureDbFanout` parallels `isPureToolFanout`
exactly. No CRAG identifiers, no benchmark conditionals. The remaining
gap (whichever of the three suspects above) is also expected to be
generic-fixable.

**Input that would unlock progress**:
- 30-60 min of focused investigation into worker.ts:169 vs 260 vs 326
  to identify the specific gate condition still rejecting CRAG
  trajectories. Suspected first investigation: enable verbose worker
  logging (or add temporary console.error) to capture the exact
  rejection reason from `shouldCrystallise` and `extractCandidateTemplates`.
- THEN: ~1-2 hours wall-clock for SkillCraft full-126 re-run on the
  iter9b+iter9c substrate (non-regression gate; iter7 was confirmed
  via 1-task sanity).
- THEN: ~10-15 hours wall-clock for full 2,706-question CRAG eval.
- Total to fully meet Goal 5 condition: ~12-17 hours of background eval
  + ~1-2 hours of focused next-session work on iter9d (the rejection
  reason fix).

**State at block**: 22 commits on `worktree-eval+crag` branch (plus the
uncommitted iter9b + iter9c edits in `src/observer/gate.ts` and
`src/eval/cragRunner.ts`). `pnpm typecheck` clean throughout. `pnpm test`
374/374 passing throughout. SkillCraft 1-task non-regression PASSED on
iter7 substrate. The Goal 5 verification surface (paired-comparison.md
at `eval/crag/results/small-n-1779157398395/`) covers a 50-question
small-N — not the full 2,706 the goal requires.

### _(append next entry here)_
