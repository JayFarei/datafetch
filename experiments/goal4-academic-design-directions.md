# Goal 4 Academic Design Directions

Date: 2026-05-15

Status: planning note for the next Goal 4 attack loop. This document turns the
ReGAL, PSN, and SkillX ideas into concrete Datafetch/SkillCraft probes. It is
not a claim that the current system already implements these mechanisms.

## Current Position

The current Goal 4 lead is a learned record-backed fanout interface. Cold
episodes are nudged into a substrate-rooted shape:

```text
df.db.records.findExact(...) -> df.lib.per_entity(...) -> learned recordToolFanout
```

The observer then crystallizes a reusable `df.lib.recordToolFanout` helper for
later episodes. The current implementation already has:

- Structural intent signatures in
  `src/observer/template.ts`, where concrete primitive names are collapsed into
  category skeletons such as `db -> FANOUT(tool) -> lib`.
- A cold-start fanout prompt scaffold in
  `src/eval/skillcraftFullDatafetch.ts`.
- A learned-reuse prompt surface that exposes `recordToolFanout`.
- A generic `paramByTool` slot in `recordToolFanout`, `toolFanout`, and the
  seed `per_entity` helper.
- Separate R1-R9 scoring plus extra diagnostics, so the rubric is not changed
  by helper instrumentation.

The best small-eval evidence so far:

- `goal4-iter55-codexdirect-mini-tvmaze-coldsetup-rowaliases-hooksdraft-20260515`
  passed R1/R2/R3/R4/R6/R7 in a single family, with all six trajectories using
  the exact `db -> FANOUT(tool) -> lib` signature. R8 remained high at `0.728`.
- `goal4-iter56-codexdirect-mini-tvmaze-university-validate-coldsetup-rowaliases-hooksdraft-20260515`
  passed R1/R2/R3/R4/R6/R7/R9 across two families. R8 narrowly failed at
  `0.713`.
- `goal4-iter57-codexdirect-mini-tvmaze-university-validate-noinitiallearned-hooksdraft-20260515`
  passed R8 at `0.6516`, but lost reliability: R1 and R3 failed. This means
  broad prompt compression is not the next lever.

Independent review flagged the remaining honesty risk: the current loop proves
structural cross-family helper calls more strongly than semantic helper reuse.
The next design direction should therefore improve promotion discipline, tool
dependency modeling, and post-promotion governance.

## Source References

Academic sources:

- ReGAL: "Refactoring Programs to Discover Generalizable Abstractions",
  arXiv:2401.16467, https://arxiv.org/abs/2401.16467
- ReGAL code: https://github.com/esteng/regal_program_learning
- PSN: "Evolving Programmatic Skill Networks", arXiv:2601.03509,
  https://arxiv.org/abs/2601.03509
- SkillX: "Automatically Constructing Skill Knowledge Bases for Agents",
  arXiv:2604.04804, https://arxiv.org/abs/2604.04804
- SkillX code: https://github.com/zjunlp/SkillX

Local code and evidence:

- `experiments/EXPERIMENT_NOTES.md`: iter49-57 evidence and Rawls review.
- `src/eval/skillcraftFullDatafetch.ts`: prompt rendering, cold setup,
  learned reuse surface, Codex-direct eval backend.
- `src/observer/template.ts`: intent signatures, nested and subgraph template
  extraction.
- `src/observer/author.ts`: generated `recordToolFanout` and `toolFanout`
  helper source.
- `eval/skillcraft/scripts/score-r1-r9.ts`: official Goal 4 scorecard logic
  plus diagnostics.

## Direction 1: ReGAL-Style Verified Abstraction Promotion

### Paper Mechanism

ReGAL learns helper functions by refactoring batches of primitive programs into
candidate abstractions, then verifying that the refactored programs preserve the
original execution outputs. The important pieces for us are:

- Cluster related examples before abstraction.
- Generate candidate helpers within a multi-example scope.
- Execute the refactored program.
- Add helpers to the code bank only after verification.
- Keep passing and failing cases for edit/prune cycles.

### Current Gap

Datafetch currently promotes the record fanout pattern when the trajectory shape
converges. That catches reusable structure, but it does not yet prove that every
tool slot in the learned helper is semantically valid for the mounted record
entity. This is where iter56 can look good on R9 while still being questionable:
university can call the cross-family helper, but some fanned-out tools may be
dependent on values that are not the record entity.

### Datafetch Translation

Add a verification gate before a learned helper is considered promotable or
preferred:

1. Recover the source trajectory's raw tool outputs.
2. Run the candidate helper on the same record set, tool bundle, tool names,
   `entityField`, `paramName`, and `paramByTool`.
3. Compare helper output rows against the raw outputs.
4. Store verification cases with the helper metadata.
5. Promote only if the helper reproduces the observed outputs for all examples
   in the candidate cluster.

This does not require new model calls. The first implementation should be an
offline artifact walker over existing iter55/56 result directories.

### Testable Probe

Build an offline script, tentatively:

```text
eval/skillcraft/scripts/verify-learned-helper-candidates.ts
```

Inputs:

- result directory
- `helper-instrumentation.jsonl`
- trajectory artifacts
- generated learned helper metadata
- task configs and tool schemas

Outputs:

- per-helper candidate verification report
- per-tool-slot verification status
- examples passed/failed
- proposed promotion state: `verified`, `narrow`, `suspect`, `reject`

Pass criteria for the probe:

- The iter55 tvmaze helper verifies against all same-family fanout rows.
- The iter56 cross-family helper either verifies cleanly or produces a specific
  list of invalid/dependent tool slots.
- No scoring rubric is changed.

### Keep

Keep verification-gated promotion. This is the strongest academic match to our
current failure mode.

### Discard For Now

Do not add LLM-based helper rewriting in the first pass. ReGAL uses edit/retry,
but we should first prove deterministic verification can identify the bad slots.

## Direction 2: SkillX-Style Multi-Level Skill Hierarchy

### Paper Mechanism

SkillX organizes experience into three levels:

- Atomic skills: single-tool usage constraints and common failure modes.
- Functional skills: reusable tool-composition subroutines.
- Planning skills: ordering, dependencies, and branching between subtasks.

The missing level in Datafetch is the planning skill. We have atomic tool
schemas and functional helpers such as `recordToolFanout`, but we do not encode
dependencies like "call search by country, read the returned domain, then call
the domain lookup tool."

### Current Gap

The current learned-reuse surface treats all task-relevant tools as if they can
share one entity value. That works when every tool accepts the same record
entity, but it is wrong for dependent or multi-hop tools.

Example distinction:

- Same-entity fanout: record entity can be passed directly to every selected
  tool.
- Dependent tool: tool B requires a field produced by tool A.

The current `paramByTool` solves parameter-name mismatch. It does not solve
value-dependency mismatch.

### Datafetch Translation

Represent a compact planning layer beside the functional helper:

```ts
type FanoutPlan = {
  recordFilter?: Record<string, unknown>;
  recordLimit?: number;
  entityField: string;
  sameEntityTools: Array<{
    toolName: string;
    paramName: string;
    valueSource: "record";
  }>;
  dependentTools: Array<{
    toolName: string;
    paramName: string;
    valueSource: {
      fromTool: string;
      path: string;
    };
  }>;
};
```

`recordToolFanout` should handle `sameEntityTools`. Dependent tools should be
left to answer code or a later planning helper.

This is a semantic fit layer, not a family-specific branch. It should be derived
from:

- tool input schemas from `df.d.ts`
- record fields and attributes
- observed successful call payloads
- whether a tool's required input value came directly from the record or from a
  previous tool output

### Testable Probe

Implement a schema/trajectory analyzer that classifies tool slots:

```text
eval/skillcraft/scripts/classify-fanout-tool-slots.ts
```

For each task/family:

- Extract record fields and attributes.
- Extract tool input schemas and required parameter names.
- Inspect observed call payloads.
- Classify each tool as `sameEntity`, `dependent`, `sharedInput`, or `unknown`.
- Emit the exact `sameEntityTools` list that should be safe for
  `recordToolFanout`.

Then wire the classifier into:

- `renderColdStartFanoutSetup`
- `renderLearnedReuseSurface`

The prompt should change from:

```text
call all task-relevant tools through recordToolFanout
```

to:

```text
call the verified same-entity fanout through recordToolFanout; call dependent
tools after reading the needed field from those rows
```

Pass criteria:

- Two-family validate keeps R1/R3/R6/R7/R9 green.
- R8 falls to `<=0.70`.
- Helper-slot diagnostics show dependent tools are not counted as semantic
  `recordToolFanout` contribution.

### Keep

Keep the three-level skill model as the product-level mental model:

- atomic: tool usage notes and schemas
- functional: `recordToolFanout`
- planning: direct vs dependent tool composition

### Discard For Now

Do not build a full SkillX skill knowledge base. We only need the planning layer
needed to prevent over-broad fanout.

## Direction 3: PSN-Style Maturity, Fault Localization, And Prune/Edit

### Paper Mechanism

PSN treats skills as executable symbolic programs in a network. Its useful
mechanisms for us are:

- Trace-based fault localization: only executed paths receive updates.
- Maturity-aware gating: reliable skills become stable; low-confidence skills
  remain plastic.
- Structural refactoring with rollback validation: merge, extract, or prune
  skills only if performance does not regress.

### Current Gap

Datafetch currently has helper existence and helper calls, but not enough
governance around helper reliability. A helper can be visible because it was
learned, even if:

- it only worked in one cluster,
- one tool slot repeatedly fails,
- answer code never actually uses some tool outputs,
- a later family exposes that the helper was over-generalized.

### Datafetch Translation

Add lightweight helper maturity metadata:

```ts
type HelperMaturity = {
  helperName: string;
  intentSignature: string;
  attempts: number;
  passes: number;
  runtimeErrors: number;
  scoreMean?: number;
  scoreMin?: number;
  families: string[];
  entityFields: string[];
  verifiedCases: number;
  failedCases: number;
  toolSlots: Record<string, {
    attempts: number;
    verified: number;
    failed: number;
    usedByAnswer: number;
    classification: "sameEntity" | "dependent" | "sharedInput" | "unknown";
  }>;
  state: "candidate" | "verified" | "preferred" | "suspect" | "quarantined";
};
```

Prompt exposure should depend on state:

- `candidate`: visible only in normal/diagnostic mode.
- `verified`: available, but not force-preferred.
- `preferred`: exposed in the compact learned-reuse surface.
- `suspect`: hidden from learned-reuse prompt, available only in diagnostics.
- `quarantined`: not callable in eval prompts.

### Testable Probe

Add helper maturity computation to the scorer or a sidecar script:

```text
eval/skillcraft/scripts/helper-maturity-report.ts
```

The report should join:

- normalized rows
- helper instrumentation
- official per-row scores
- runtime failures
- fanout slot verification
- answer source usage of `row.tools[...]` or top-level tool keys

Pass criteria:

- iter55 helper becomes `verified` or `preferred`.
- iter56 cross-family helper either becomes `preferred` with evidence or is
  narrowed/suspect with a clear slot-level reason.
- R9 is not considered credible unless the helper is verified or preferred and
  at least one non-seed helper output is used in answer code for both families.

### Keep

Keep maturity scoring and executed-path fault localization. This gives us a way
to improve without discarding the whole learned helper when only one slot is
wrong.

### Discard For Now

Do not implement full network architecture search. We do not need PSN's whole
skill graph to crack this rubric. We need per-helper, per-slot governance.

## Integrated Experiment Plan

The three directions should be tested in this order:

1. Verification report, read-only.
2. Fanout slot classifier, read-only.
3. Same-entity/dependent tool filtering wired into prompts.
4. Maturity report, read-only.
5. Single-family probe.
6. Two-family validate.
7. Independent review for reward-hacking risk.
8. Only then consider full-126.

### Non-Negotiable Constraints

Do not count wins that rely on:

- SkillCraft-specific branches.
- Family or task ID prompt branches.
- Pre-baked tenant helpers.
- Seed-only reuse.
- Runtime defaults that hide bad generated code.
- Prompt wording that forces helper calls even when semantic fit is unverified.
- Scorer changes that relax R1-R9.

### Full-126 Spending Gate

Before any full-126, require:

- one single-family probe with R1/R3/R6/R7 green and R8 trending down;
- one two-family validate with R1/R2/R3/R4/R6/R7/R9 green;
- R8 `<=0.70`;
- helper maturity evidence for at least one cross-family learned helper;
- semantic contribution evidence that answer code uses non-seed helper outputs;
- independent review concluding the result is not metric steering.

## Goal Prompt

Copy-paste this as the next goal:

```text
/goal Crack Goal 4 by testing three academic design directions against the current Datafetch/SkillCraft learned-interface lead: ReGAL-style verified abstraction promotion, SkillX-style planning skill decomposition, and PSN-style helper maturity/fault-localization governance.

Context: The current lead is iter56-style `recordToolFanout` reuse. It passes R1/R2/R3/R4/R6/R7/R9 in a two-family validate but misses R8 at 0.713 and has a semantic-honesty concern: cross-family helper calls may prove structural reuse more than valid learned-helper transfer. iter57 proves prompt compression can pass R8 but breaks R1/R3, so do not pursue context removal as the primary lever.

Objective: Build evidence that the system is becoming an adaptive retrieval interface that improves with use, without reward hacking. Exhaustively test the three design directions through offline checks and small evals before spending another full-126.

Direction 1, ReGAL: implement/read out verification-gated promotion. A candidate helper should not be preferred merely because the trajectory shape matches. Reconstruct raw fanout outputs from prior successful trajectories, run the candidate helper on the same records/tools/params, and mark helper/tool slots as verified, narrow, suspect, or rejected. Start with a read-only artifact walker over iter55/iter56 before wiring behavior.

Direction 2, SkillX: add the missing planning-skill layer. Split task tools into same-entity fanout tools vs dependent/multi-hop tools using tool schemas, record fields/attributes, and observed call payloads. `recordToolFanout` should only receive tools whose input value is directly valid for the mounted record entity. Dependent tools should be called later by answer code after reading needed fields from prior outputs. This must be schema/trajectory-derived, not family/task-id branched.

Direction 3, PSN: add lightweight maturity and fault-localization governance. Track helper reliability per intent signature, family, entityField, tool slot, verification case, official score, runtime error, and answer-code usage. Expose helpers as candidate/verified/preferred/suspect/quarantined. Only executed helper/tool slots receive credit or blame. Do not rewrite the whole helper when only one slot is wrong.

Work loop: first create offline diagnostics for verification, slot classification, and maturity. Then implement the smallest substrate-level behavior change: same-entity/dependent filtering in the cold-start and learned-reuse surfaces. Run a single-family probe, then a two-family validate. If a lever fails, record the evidence in experiments/EXPERIMENT_NOTES.md and try the next substrate-level variant rather than spending full-126.

Win gate before full-126: R1/R3/R6/R7 green in a single-family probe; then R1/R2/R3/R4/R6/R7/R9 green and R8 <=0.70 in a two-family validate; zero cache-token dependence; no warm/hard weak partial-score clustering; and helper maturity/verification evidence that non-seed learned-helper outputs are semantically used across families.

Do not count wins that rely on SkillCraft-specific branches, pre-baked tenant helpers, seed-only reuse, prompt branches keyed on family/task identity, runtime payload defaults that mask bad agent code, scorer relaxations, or forcing `recordToolFanout` when semantic fit has not been verified.

Use references:
- experiments/goal4-academic-design-directions.md
- experiments/EXPERIMENT_NOTES.md iter49-57 and Rawls review
- src/eval/skillcraftFullDatafetch.ts
- src/observer/template.ts
- src/observer/author.ts
- eval/skillcraft/scripts/score-r1-r9.ts
- ReGAL arXiv 2401.16467 and repo esteng/regal_program_learning
- PSN arXiv 2601.03509
- SkillX arXiv 2604.04804 and repo zjunlp/SkillX

Always use independent review before declaring a promising lead full-126-worthy.
```
