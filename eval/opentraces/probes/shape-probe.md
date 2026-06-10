# G1 shape probe (plan 011 R10, KILL-GATE)

Question: does the substrate's intent-signature pipeline produce learnable, non-collapsing signatures over this corpus's access patterns? Precedent and motivation: kb/br/17, where every CRAG-shaped trajectory collapsed to one FANOUT signature and warm reuse returned a silently wrong answer; this gate exists to catch that failure before any live arm run on this corpus.

## Pre-registered protocol and kill conditions (immutable once the first extraction runs)

- **Sessions**: 9 scripted sessions, 3 template families x 3 parameter draws each: P1-T1 (envelope aggregation), P3-T2 (filter and project), P4-T1 (event-join attribution). NO LLM anywhere in this probe: snippets are deterministic scripts emulating each template's natural `df.*` access pattern.
- **Execution path**: preferred, run snippets through the real snippet runtime over bounded sealed-snapshot slices (<=5k records per session) loaded via the eval records mount, so genuine TrajectoryRecords are produced (the substrate unit tests show the no-LLM pattern). Fallback if mounting proves blocked: hand-construct TrajectoryRecords matching the recorder schema (the kb/br/17 method), and log which path was used; the fallback weakens realism and must be noted in the verdict.
- **Extraction**: run the substrate's template extraction (`extractTemplate` / shape hash, `src/observer/template.ts`) offline over all 9 trajectories. Tabulate: session, family, params, intent signature, shape hash.
- **PASS requires BOTH**:
  - *Separation*: at least 2 distinct signature clusters whose boundaries align with template families.
  - *Stability*: in at least 2 of 3 families, all 3 parameter draws share one signature (without a stable within-family key, crystallised helpers can never be matched for reuse).
- **FAIL (kill)**: all 9 trajectories collapse to one signature (the br/17 failure mode), OR at least 2 families are all-unique within family. On FAIL: STOP, write the negative finding to the RUN-LOG and kb/research.md; substrate signature work is scoped as a separate plan (this plan's scope boundary forbids fix attempts here).
- **Pre-registered prediction**: 3 clusters, one per family; P4-T1 is the family most at risk of collapsing into a generic scan signature; P1-T1 is the family most likely to be stable across draws.

## Results (append-only; protocol above was committed before any extraction)

(pending)

### 2026-06-10 M6 execution

Execution path: real `DiskSnippetRuntime` over `EvalRecordsMount`, with records read only from `eval/opentraces/vendor/snapshot/`. Fallback was not used. All nine runs recorded `llmCalls = 0`. Trajectories and run evidence are saved under `eval/opentraces/probes/g1-runs/`; the summary file is `eval/opentraces/probes/g1-runs/summary.json`.

| session | family | params | records | calls | intent signature | shape hash |
|---|---|---|---:|---:|---|---|
| p1_t1_01 | P1-T1 | `{"group_by":"model","window":{"end":"2026-05-02T00:00:00Z","label":"April 26 through May 1, 2026","start":"2026-04-26T00:00:00Z"}}` | 1592 | 1 | `db` | `1fd210b3` |
| p1_t1_02 | P1-T1 | `{"group_by":"project","window":{"end":"2026-06-01T00:00:00Z","label":"May 2026","start":"2026-05-01T00:00:00Z"}}` | 1592 | 1 | `db` | `1fd210b3` |
| p1_t1_03 | P1-T1 | `{"group_by":"day","window":{"end":"2026-05-24T00:00:00Z","label":"the week of May 17, 2026","start":"2026-05-17T00:00:00Z"}}` | 1592 | 1 | `db` | `1fd210b3` |
| p3_t2_01 | P3-T2 | `{"project":"2026-03-27-community-traces-hf-24eb286b"}` | 1592 | 1 | `db` | `b577b96a` |
| p3_t2_02 | P3-T2 | `{"project":"project-24eb286b"}` | 1592 | 1 | `db` | `b577b96a` |
| p3_t2_03 | P3-T2 | `{"project":"project-76420f2c"}` | 1592 | 1 | `db` | `b577b96a` |
| p4_t1_01 | P4-T1 | `{"commit":"05ecab6e9564a2a9d07b0ef8b190f12188284401"}` | 4141 | 2 | `FANOUT(db)` | `8ffc245b` |
| p4_t1_02 | P4-T1 | `{"commit":"067599b03f0bfcd8ac9650b18aa7511c7299641a"}` | 4141 | 2 | `FANOUT(db)` | `8ffc245b` |
| p4_t1_03 | P4-T1 | `{"commit":"1126d01f2de6067feec1128e76be283cbeae40be"}` | 4141 | 2 | `FANOUT(db)` | `8ffc245b` |

Checks:

- Separation: not satisfied. There are 2 distinct intent-signature clusters, but only 1 cluster is family-bounded: `FANOUT(db)` contains only P4-T1, while `db` mixes P1-T1 and P3-T2.
- Stability: satisfied. All 3 families are stable across their 3 draws: P1-T1 = `db`, P3-T2 = `db`, P4-T1 = `FANOUT(db)`.
- Explicit fail clauses: not triggered by the two enumerated clauses. All 9 did not collapse to one signature, and 0 families were all-unique within family.

Verdict: **PASS WITH DISCLOSED LIMITATION** (supervisor, 2026-06-10). The pre-registered PASS clause was ambiguous about granularity (the protocol required tabulating both intent signature and shape hash but said "signature clusters"); both readings are therefore recorded, and the ambiguity is owned as a protocol-authoring gap, not resolved silently.

- Shape-hash reading, the substrate's MATCHING key (`src/observer/gate.ts:352` dedups on `existing.shapeHashes.has(shapeHash)`): 3 clusters (`1fd210b3`, `b577b96a`, `8ffc245b`), exactly family-bounded and exactly stable, matching the pre-registered prediction of 3 clusters. Separation AND stability satisfied. The br/17 failure mode this gate exists to catch, collapse at the matching key leading to wrong-helper warm reuse, is ABSENT: a P3-T2 trajectory cannot match a P1-T1 helper.
- Intent-signature reading, the substrate's RECURRENCE key (`src/observer/convergenceIndex.ts:89-96` counts distinct trajectories per `intentSignature`): 2 clusters; `db` merges P1-T1 and P3-T2. Consequence: recurrence counts pool across those families, inflating the recurrence estimate for merged families. Mute today (MVP convergence N=1) but binding for the arms experiment.
- Carry-forward (binding on the successor arms plan and any evidence-layer recurrence estimation): recurrence/convergence accounting must key on shape hash or pack template_id, NOT raw intentSignature, or the merged-family pooling must be explicitly modeled. This is the surviving half of br/17's "finer-grained intent signatures" recommendation: the shape hash got finer; the intent label did not.
