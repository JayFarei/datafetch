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

### _(append next entry here)_
