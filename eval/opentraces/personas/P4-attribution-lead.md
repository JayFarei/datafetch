# P4: Attribution lead

Authored by supervisor (plan 011 M3, pre-registered before any arm run). Status: draft pending user redline.

**JTBD**: connect agent work to what actually shipped: which session produced a commit, where effort went per file or library, what survived. Evidence of demand: the upstream Trail subsystem (`trail blame/graph/track`, git anchors, patch trails) is this persona's lens already crystallised into product.

**Cadence model**: per-incident blame (a commit looks wrong, find its session and context; medium recurrence, bursty); quarterly effort review by area (high recurrence at low frequency, identical shape); one-off archaeology question (low recurrence, should NOT pay back).

**Utility function**: turns from commit-sha to (trace, step, context) provenance; secondary, tokens for the quarterly effort table.

## Templates

P4 owns the cross-store joins (events to traces to contexts), the deepest derivation work in the pack.

| id | question shape (consumer phrasing) | slots | answer_type | difficulty |
|---|---|---|---|---|
| P4-T1 | Which session produced commit C? | C (sha present in git anchors) | exact trace_id | cross-store join |
| P4-T2 | How many sessions touched files matching pattern G in window W, and what did they cost in total tokens? | G; W | numeric pair (tol 1%) | cross-store join |
| P4-T3 | For repo R in window W: how many sessions ran and how many commits got anchored? | R; W | numeric pair (tol 0) | aggregate |
| P4-T4 | In window W, how many patches were created vs how many ended up git-anchored? | W | numeric pair (tol 0) | drift-spanning (event schema versions differ across W) |
| P4-T5 | What context did the agent observe at step K of trace T? | T; K | set of context_node_ids | cross-store join (contexts) |
| P4-T6 | How much work involved library L (sessions whose recorded patch paths or task description contain L, exact-substring rule)? | L; W | numeric (tol 0) + set | filter |
| P4-T7 | Which session produced commit C'? (C' not in any anchor) | C' nonexistent | abstain | abstention |

Solver sketches: T1/T3/T4 scan `events/v1/batches/` for `git_anchor_*` and `trace_patch_created` events and join to envelopes by trace_id; T2/T6 use envelope `record.patches` paths plus `task.description` under a precisely stated substring rule; T5 reads `context_node_observed` events filtered by trace_id and step_index against `contexts/`. T7's grader scores any trace_id as -1.

## Pre-registered predicted emergent interface

P4 crystallises the deepest helpers in the corpus, approximately `blame(commitSha)` and `fileEffort({glob, window})`, both requiring event-batch scans joined to envelopes, the highest inline re-derivation cost of any persona (this is where plan 011's serial-depth cost island should show if it exists at all). Prediction: P4's helpers are the most reused-per-crystallisation in the pack, and the quarterly T3 table does NOT get promoted (recurrence too low for its build cost). Divergence: P4's library shares no helper shape with P3 and at most a token-sum primitive with P1.
