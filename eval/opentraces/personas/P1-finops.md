# P1: FinOps optimizer

Authored by supervisor (plan 011 M3, pre-registered before any arm run). Status: draft pending user redline.

**JTBD**: keep AI spend accountable and shrinking across the team's agent usage without hurting outcomes. Evidence of demand: the upstream Trace Intelligence subsystem (`trace --waste`, `--run-intel`, `trace compare`) is this persona's lens already crystallised into product.

**Cadence model**: weekly cost review (burst of 4-6 correlated queries, high recurrence); per-incident spike forensics (medium recurrence, bursty); monthly distillation harvest (low recurrence); one-off vendor-pricing what-if (T7-class, should NEVER pay back, the promotion policy must not promote it).

**Utility function**: model-context tokens and turns from "question asked" to "correct number in hand" for the weekly review set; secondary, time-to-explanation for a spike.

## Templates

| id | question shape (consumer phrasing) | slots | answer_type | difficulty |
|---|---|---|---|---|
| P1-T1 | How many tokens did we spend, split input/output/cache, grouped by G, over window W? | G in {model, project, day}; W | numeric set (tol 0) | aggregate |
| P1-T2 | Which sessions in window W had cache hit rate below X? | W; X | set of trace_ids + rates | filter |
| P1-T3 | Top N sessions by waste proxy in window W (waste proxy v1 = total_input_tokens / max(1, total_steps)) | N; W | ordered set | aggregate |
| P1-T4 | On the most expensive day in window W, which sessions drove at least P% of that day's total tokens? | W; P | set | temporal+aggregate |
| P1-T5 | Distillation candidates: committed sessions on model M with at most N steps in window W | M; N; W | set of trace_ids | filter |
| P1-T6 | What is the mean total-token cost of sessions that invoked skill S vs sessions that did not, window W? | S; W | numeric pair (tol 1%) | join-ish aggregate |
| P1-T7 | How much did we spend on model M' in window W? (M' absent from the data) | M' nonexistent; W | abstain | abstention |

Solver sketches: T1-T5 walk trace envelopes (`record.metrics.*`, `record.agent.model`, `project_slug`, `timestamp_start`); T6 splits on `record.metadata.skill_invocations`; T7 must return "no data for M'" and the grader scores any number as -1.

## Pre-registered predicted emergent interface

If the thesis holds, P1's tenant crystallises 2-3 deep aggregation helpers, approximately `spendBy({groupBy, window})`, `wasteTop({n, window})`, `distillationCandidates({model, maxSteps, window})`, and the weekly-review burst is where reuse fires (serial-depth aggregations over 1,528 envelopes are expensive to re-derive inline). The one-off T7-class question must NOT yield a promoted helper. Predicted NOT to emerge: anything event-log-deep (P1 questions are answerable from envelopes alone).
