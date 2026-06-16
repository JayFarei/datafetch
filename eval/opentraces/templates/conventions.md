# Question and solver conventions (binding for M4/M5)

Supervisor-authored at M3 redline, 2026-06-10, after the G0 audit showed naive errors splitting into genuine failures and semantic ambiguity. For a cost gate that split didn't matter; for the correctness endpoint the pack must support, it does. Question text stays consumer-phrased but must close these ambiguities.

1. **Time windows**: half-open `[start, end)` on `record.timestamp_start`, UTC. Question text says e.g. "sessions started in May 2026 (UTC)". Never bucket by `written_at` or event_time unless the question is explicitly about events.
2. **"Session"**: one captured trace. Answers identify a session by trace_id; where the question asks "which session", gold carries BOTH the trace_id and that envelope's `record.session_id`.
3. **"Committed"**: the capture record's committed flag (`record.outcome.committed` is the implementation; question text says "marked committed in the capture record"). Never git-dirty heuristics.
4. **"Produced commit C"**: trail attribution, `git_anchor_created` events matched on `payload.commit_id.hex == C` (the upstream `anchors_for_commit` rule). Time-window overlap is NOT attribution. The SHA appearing in search-context events is NOT attribution.
5. **Token figures**: from `record.metrics` totals. "Input+output tokens" = `total_input_tokens + total_output_tokens` (cache fields excluded); when a question wants cache included it must say "including cache reads/writes". `estimated_cost_usd` is null everywhere; never reference dollar cost.
6. **"Shareable"**: envelope `security.syncable == true` (question text: "marked shareable"). Privacy tier is `security.privacy_tier`.
7. **"Skill invoked"**: membership in `record.metadata.skill_invocations`.
8. **Populations for event-joined questions**: the event log covers only ~423 of 1,592 traces. Event-join questions must be phrased so the covered set is the natural population ("among sessions with recorded activity events...") or the answer must be invariant to the gap; the solver states its population in evidence.
9. **Envelope reads**: ALWAYS via the `current.json` pointer (1,376/1,592 dirs carry stale extra bodies; glob-last reads pre-rescan state).
10. **Solver CLI contract**: parameterised solvers print usage to stderr and exit 2 on missing/invalid args; never exit 0 with empty stdout. Output is exactly one JSON object via `common.emit(gold, evidence)`.
11. **Tolerances by answer_type**: token counts and integer counts exact (tol 0); durations tol 0.1s; means/fractions tol 1% relative, with fractions reported as numerator/denominator plus value; sets order-insensitive; abstention rows graded tri-state (correct abstain +1, any concrete value -1).
12. **Abstention rows**: must reference entities verifiably absent from the frozen snapshot (checked by a solver that returns the absence proof in evidence).
