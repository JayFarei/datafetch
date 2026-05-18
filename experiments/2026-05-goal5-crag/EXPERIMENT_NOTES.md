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

### _(append next entry here)_
