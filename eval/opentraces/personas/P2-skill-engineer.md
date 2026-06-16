# P2: Skill engineer

Authored by supervisor (plan 011 M3, pre-registered before any arm run). Status: draft pending user redline.

**JTBD**: develop and maintain a set of agent skills; know which skills get used, whether sessions that use them end well, and what they cost. Evidence of demand: the upstream `skill-verifier` and `workflow skill-intelligence` subsystems are this persona's lens already crystallised into product.

**Cadence model**: per-skill-release evaluation burst (high recurrence while a skill is under iteration); weekly portfolio glance (medium); one-off archaeology on a retired skill (low recurrence, should NOT pay back).

**Utility function**: turns from "how is skill S doing" to a defensible verdict table; secondary, cost-per-verdict in model-context tokens.

## Templates

| id | question shape (consumer phrasing) | slots | answer_type | difficulty |
|---|---|---|---|---|
| P2-T1 | Which skills were invoked in window W, with invocation counts? | W | set (skill, count) | aggregate |
| P2-T2 | For skill S in window W: how many sessions invoked it, what fraction ended committed, mean duration? | S; W | numeric triple (tol 1%) | filter+aggregate |
| P2-T3 | List the sessions where skill S was invoked but the session did NOT end committed | S; W | set of trace_ids | filter |
| P2-T4 | Mean total-token cost of sessions invoking S, by week, over window W | S; W | numeric series (tol 1%) | temporal aggregate |
| P2-T5 | Which other skills co-occur in the same session as S? | S; W | set | join-ish |
| P2-T6 | How did skill S' perform? (S' never invoked anywhere in the snapshot) | S' nonexistent | abstain | abstention |

Solver sketches: all walk trace envelopes; skill identity from `record.metadata.skill_invocations`; outcome from `record.outcome.committed`; duration from `record.metrics.total_duration_s`; cost from `record.metrics.total_*_tokens`. T6's grader scores any performance number as -1.

## Pre-registered predicted emergent interface

P2 crystallises approximately one parameterised helper, `skillReport({skill, window})` returning the T2/T3/T4 bundle, because the release-burst cadence repeats the same join with different skill values. Co-occurrence (T5) is predicted too rare to promote. Cross-persona prediction: P2's helper shares a per-trace token-summing primitive shape with P1's `spendBy` but the persona libraries otherwise diverge (at most 1 shared helper shape between P1 and P2).
