# SCHEMA-TRUTH (QUARANTINED, plan 011 R3)

This document is the held-out oracle truth for the OpenTraces dark-store corpus. It must NEVER be mounted into an agent workspace, quoted in any agent-facing prompt, or used to phrase question text. It exists for: solver authoring, discovery-quality scoring, and the I\* sketch. Machine-readable facts: `vendor/schema-facts.json` (uncommitted; regenerate with `scripts/enumerate_schema.py`).

Frozen snapshot: `vendor/snapshot/` copied 2026-06-10 from `~/.opentraces/bucket/` (stores: `objects/`, `events/`, `contexts/`, `blobs/`, `manifest.json`; `projections/` and `index/` deliberately excluded as derived state). Inventory and digest: `seal.json`.

## 1. Store map

| Store | Path under snapshot | Scale (frozen) | Unit |
|---|---|---|---|
| Trace envelopes | `objects/traces/v1/<project_slug>/<trace_uuid>/` | 1,592 traces, 185,955 steps, 5,581 patches | `current.json` (pointer, ~510B) + `<content_hash>.json` (envelope) |
| Event log | `events/v1/batches/*.jsonl.gz` | 861,028 events in 7,023 batches | one JSON object per line |
| Context trees | `contexts/` | 771 files | per-trace tree state + layer refs |
| Blobs | `blobs/` | 432 files | content-addressed layer bodies referenced by contexts |
| Manifest | `manifest.json` | 1 | bucket-level counts + digests (`opentraces.bucket.manifest.v2`) |

Time span: 2026-03-27T19:03Z to 2026-06-10T08:04Z (`record.timestamp_start`). Project skew: ~84% of traces in one project dir; templates must parameterise within it (windows, entities), not only across projects.

## 2. Trace envelope schema (`opentraces.bucket.trace_record.v1`, 100% of traces)

Envelope: `{legacy_mirror: bool, project_slug, record: {...}, record_hash, schema_version, security: {current_security_version, filtered, flags_reviewed, redactions_applied, privacy_tier, scanned, stale, syncable, security_version, tools_applied[]}, source_layer, trace_id, written_at}`.

`record`: `{agent: {model, name, version}, attribution, content_hash, context_tree_summary, dependencies[], environment: {language_ecosystem[], os, shell, vcs{}}, execution_context, generation_index, git_links[], lifecycle, metadata: {...}, metrics: {cache_hit_rate, estimated_cost_usd, total_cache_creation_tokens, total_cache_read_tokens, total_duration_s, total_input_tokens, total_output_tokens, total_steps}, outcome: {commit_sha, committed, description, reward, reward_source, signal_confidence, signal_source, success, terminal_state}, patches[], schema_version, security{}, session_id, steps[], system_prompts{}, task: {base_commit, description, repository, repository_url, source}, timestamp_start, timestamp_end, tool_definitions[], trace_id}`.

`steps[]` (uniform key set across all sampled steps): `{agent_role, call_type, content, context_node_id, model, observations, parent_step, reasoning_content, role, snippets, step_index, subagent_trajectory_ref, system_prompt_hash, timestamp, token_usage: {cache_read_tokens, cache_write_tokens, input_tokens, output_tokens, prefix_reuse_tokens}, tool_calls[]: {duration_ms, input, tool_call_id, tool_name}, tools_available}`.

Key distributions (frozen, pointer-resolved; corrected 2026-06-10 after the G0 audit caught the stale-body bug): sources `codex_cli_rollout` 981, missing/null 609, `pi_session_jsonl` 2 (the polymorphism axis: `record.metadata` sub-objects differ by source; claude-code-hook captures carry `hook_*`/`normalized_tool_calls`, codex carries `codex_cli*`). Models: opus-4-8 288, opus-4-7 254, fable-5 26, opus-4-6 26, `<synthetic>` 9, null 5, plus long tail. Lifecycle: provisional 1,550 / final 42. Outcome.committed: true 1,428 / false 164. Security: syncable true 190 (privacy_tier `medium`) / false 1,402 (tier `off`), i.e. only ~12% of the store is shareable, which makes P3's job real. 443 traces carry `metadata.skill_invocations` (P2 feasibility confirmed). Only 75 traces have non-empty `git_links` (P4 must join via the EVENT log, not envelopes).

## 3. Event log schema (discriminated union on `event_type`)

Row: `{ATTRIBUTION_VERSION, SCHEMA_VERSION, SECURITY_VERSION, batch_id, capture_method, content_hash, event_id, event_sequence, event_time, event_type, generation_index, payload{type-specific}, previous_event_id, step_index, trace_id, writer}`. Hash-chained via `previous_event_id`. Payload key-trees per type: `vendor/schema-facts.json` -> `events.payload_shapes_by_type`.

All 15 types (frozen counts): `git_anchor_search_completed` 519,616; `context_node_observed` 142,887; `trace_snapshot_created` 58,404; `trace_step_window_opened`/`closed` 36,762 each; `filesystem_mutation_observed` 28,814; `trace_patch_created` 17,246; `watcher_observation_attributed` 10,815; `git_anchor_created` 4,072; `patch_survival_cached` 2,677; `context_layer_captured` 1,576; `trace_session_closed` 403; `context_tree_reconciled` 394; `trace_step_capture_incomplete` 370; `context_compaction_observed` 230.

**Coverage caveat (load-bearing for solvers)**: events reference only 423 distinct trace_ids out of 1,592 envelopes. Event-joined questions (P4-T1/T2/T4/T5) are answerable only over that covered subset; solvers must define populations explicitly, and abstention templates can exploit the uncovered set.

## 4. Drift inventory (natural, no injection needed)

Event `SCHEMA_VERSION` populations and time ranges overlap (writers upgrade at different times): 0.3.0 (269,565; Apr 26-May 19), 0.4.0 (8,867; May 17 only), 0.5.0 (62,194; May 17-19), 0.6.0 (506,493; Apr 29-Jun 10), 0.7.0 (13,909; Jun 8-10). Drift-spanning templates (e.g. P4-T4 over a window crossing May 17-19) must handle at least three coexisting versions. Envelope schema is constant at v1; the drift axis is the EVENT layer plus `security.current_security_version` and `legacy_mirror` flags.

## 5. Cross-reference keys

`trace_id` joins envelopes <-> events <-> contexts. `step_index` joins events to `record.steps[]`. `context_node_id` joins steps to context trees. `record.outcome.commit_sha` and `git_anchor_*` payloads join to git history. `content_hash`/`record_hash` are integrity keys; envelope body filename = content hash. `previous_event_id` orders events within a writer chain; `event_sequence` orders globally.

## 6. I\* sketch (oracle interface, hand-derived)

Compactness claim (plan-010 Gate-0 analogue): the 26 persona templates compress to ~9 parameterised functions plus 3 primitives, materially more compact than one-endpoint-per-template, so learnable structure exists.

Primitives: `traces.scan(filter)` (stream envelopes), `events.scan({types?, window?, traceId?})` (stream batch rows), `ctx.nodes(traceId, stepIndex?)`.

Derived interface: `spendBy({groupBy: model|project|day, window})` (P1-T1/T4); `wasteTop({n, window})` (P1-T3); `sessionsWhere({cacheBelow?|committed?|model?|maxSteps?|window})` (P1-T2/T5); `skillReport({skill, window})` (P2-T1..T4 bundle); `coInvoked(skill)` (P2-T5); `shareReport({project, window})` (P3-T1/T3/T5); `syncBlockers({project})` (P3-T2/T4); `blame(commitSha)` (P4-T1, event-join); `fileEffort({glob, window})` (P4-T2/T6, event+envelope join); plus `patchSurvival(window)` (P4-T4, drift-spanning). Per-persona I\*_P = the subset its templates touch; predicted divergence is pre-registered in `personas/*.md`.

## 7. Known nulls and traps for solver authors

`record.metrics.estimated_cost_usd` is null in practice (cost must be computed from tokens, never read). `record.outcome.success/reward` mostly null (use `outcome.committed`). `agent.model` can be null or `<synthetic>` (9 synthetic traces: decide inclusion per-template and state it). 609 traces have no `metadata.source`. Timestamps mix `Z` and `+00:00` suffixes (normalise before comparing). **1,376 of 1,592 trace dirs contain multiple content-hash bodies** (a security re-scan rewrote envelopes in place and old bodies linger); the `current.json` pointer is the ONLY correct read. Stale bodies diverge materially: glob-and-take-last reads pre-rescan security state (1,111/481 syncable split instead of the true 190/1,402) and slightly different outcome/lifecycle fields. `common.py` follows the pointer; `enumerate_schema.py` was fixed to do the same on 2026-06-10 after the G0 R7 cross-check exposed the discrepancy. Any new reader MUST resolve through the pointer. Also: "which session produced commit C" is answered ONLY by `git_anchor_created` events matched on `payload.commit_id.hex` (the upstream `anchors_for_commit` rule, `trails/query.py`); the SHA appears in ~2,600 unrelated search-context events, and time-window plausibility gives confidently-wrong answers. Event batches are append-ordered by filename prefix (zero-padded sequence).
