# P3: Sharing steward (DEFAULT HELD-OUT PERSONA)

Authored by supervisor (plan 011 M3, pre-registered before any arm run). Status: draft pending user redline. Per plan R4 this persona is held out of any future promotion-policy tuning and used only for transfer evaluation; confirm or swap at seal.

**JTBD**: decide what captured evidence is safe to share with a third party, and produce the report that goes with it. Evidence of demand: the upstream security subsystem (bucket security policies, per-record detectors, dataset review/publish pipeline) is this persona's lens already crystallised into product.

**Cadence model**: monthly usage report to an external party (high recurrence, identical shape); pre-publication safety check per dataset push (medium, bursty); one-off incident audit (low recurrence, should NOT pay back).

**Utility function**: completeness of the share-report at zero leaked secrets; turns from "can I share project P's usage" to a yes/no with evidence.

## Templates

| id | question shape (consumer phrasing) | slots | answer_type | difficulty |
|---|---|---|---|---|
| P3-T1 | How many sessions per project are syncable vs not, and what privacy tiers do they carry? | none (whole snapshot) | numeric set | aggregate |
| P3-T2 | Which sessions in project P are blocked from sharing, and why (tier breakdown)? | P | set of trace_ids + tiers | filter |
| P3-T3 | Across window W, how many redactions were applied and how many flags reviewed in total? | W | numeric pair (tol 0) | aggregate |
| P3-T4 | Which sessions have stale or missing security scans? | none | set of trace_ids | filter |
| P3-T5 | Build the third-party usage report for project P, window W: session count, date range, total tokens, syncable fraction | P; W | composite numeric set (tol 1%) | aggregate |
| P3-T6 | What is the syncability status of project P'? (P' absent from the snapshot) | P' nonexistent | abstain | abstention |

Solver sketches: all walk trace envelopes; sharing state from envelope `security.{syncable, privacy_tier, stale, scanned, redactions_applied, flags_reviewed}`; report aggregates from `record.metrics` and `timestamp_start`. T6's grader scores any status claim as -1.

## Pre-registered predicted emergent interface

P3 crystallises approximately `shareReport({project, window})` (the T5 bundle, monthly recurrence) and possibly `syncBlockers({project})`. Because P3 is held out, the actual pre-registered prediction is about TRANSFER: helpers learned by P1/P2/P4 provide no decisive coverage of P3-T2/T5 (sharing-state fields are untouched by the other personas), so a policy tuned on P1/P2/P4 must re-derive or newly crystallise here, and per-tenant divergence shows up as a near-disjoint P3 library.
