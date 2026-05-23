# Five Experiment-Driven Next Steps

Generated: 2026-05-23T06:45:11Z

Purpose: this file is a fallback menu for future agents working the active
code-harness goal. Use it when the next move is unclear or a local line of
work stalls. Do not treat these as permission to weaken FC gates, preseed
measured helpers, bypass hook/quarantine, or replace filesystem/code discovery
with a host-owned registry. Each option should become one logged attempt in
`runs/code-harness-evals/log.md` with hypothesis, smallest generic change,
evidence, and decision.

## 1. Record Filesystem-Discovered Reuse Evidence

Status after Attempt 45: the generic parser/scorer evidence path exists, and
current FinChain Claude artifacts correctly remain blocked because they expose
no ordered inspection events before the helper call. The remaining experiment
is to run or capture an eventful agent trace that can prove or falsify actual
workspace inspection.

Hypothesis: the current `codeModeHarness.reuseEvidence.filesystemDiscovered`
layer is blocked because the scorecard can see helper calls, but not whether
the agent inspected `AGENTS.md`, `df.d.ts`, `lib/`, `datafetch apropos`, or
`datafetch man` before selecting `df.lib.*`.

Smallest experiment: add a generic discovery-evidence artifact to live eval
episodes. Prefer deriving it from existing agent traces or command/event logs
when available; otherwise record an explicit "unobservable" result rather than
guessing from the prompt. The artifact should be ordered enough to distinguish
"inspected code surface before helper call" from "prompt told the agent to call
this helper".

Verification:
- Add a focused unit test with synthetic agent events showing `ls`, `cat
  df.d.ts`, `rg`, `datafetch apropos`, or `datafetch man` before a `df.lib.*`
  call.
- Re-score a fixture where filesystem discovery is present and one where only
  prompt-directed reuse is present.
- `filesystemDiscovered` must stay `blocked` when the only evidence is prompt
  text or a final helper call.

Falsifier: if the current Claude/Codex eval artifacts do not expose enough
event data to prove inspection order, log that as a blocker and keep the layer
blocked. Do not infer discovery from the existence of `df.d.ts`.

## 2. Run a Larger Held-Out Warm-Reuse Slice

Hypothesis: one warm FinChain helper call proves the path can work, but not
that tenant libraries reduce repeated-work latency or token cost across a
family of intents.

Smallest experiment: run a bounded Claude-backed slice with at least three warm
reuse opportunities after crystallisation. Keep helper names out of the task
prompt when the architecture claim is discovery; let the agent inspect the
workspace. Candidate shapes: SkillCraft cat/dog plus one held-out family, or
FinChain balance-sheets seeds beyond the crystallisation seed.

Verification:
- Artifact walk reports at least three warm opportunities and at least three
  actual `df.lib.*` calls.
- Correctness remains saturated or non-regressed.
- `codeModeHarness.learningLoop` can move from `weak` to `proven` only if the
  threshold is met without scorer relaxation.
- If cost compression is claimed, the paired learned/control result must clear
  the current 10% token-or-wall threshold.

Falsifier: if warm tasks solve correctly but do not call helpers, preserve the
failure. The right next step is to inspect discoverability, not to mandate
helper calls in the prompt.

## 3. Add Real Helper Maturity Contracts

Hypothesis: a clean quarantine rate is not library maturity. Mature tenant
helpers need inspectable replay/change/verifier/rollback contracts that are
written with the helper and exposed to walkers/scorers.

Smallest experiment: extend observer-authored helper frontmatter or sidecar
metadata with four generic fields: `replayContract`, `changeContract`,
`verifier`, and `rollback`. The fields must be tied to existing validation and
promotion behavior, not decorative text. Then update artifact walking so
`helpersWithContracts` reflects real helper metadata.

Progress to date: Attempt 46 added declared frontmatter for source-authored
helpers and validator-stamped `@replay-contract`, `@change-contract`,
`@verifier`, and `@rollback` lines on successful promotion. The walker now
surfaces declared fields separately and only counts `contractSource:
"validated-header"` for `helpersWithContracts`. The current historical
FinChain probe remains weak because its helper was promoted before this
evidence stamping existed.

Verification:
- Focused tests show helper authoring includes the contract fields.
- Quarantine validation or replay tests exercise at least one contract path.
- `eval/finchain/scripts/walk-artifacts.ts` surfaces the fields.
- `codeModeHarness.libraryMaturity` remains `weak` unless every counted helper
  has all required fields.

Falsifier: if contracts become boilerplate with no verifier link or rollback
effect, reject the change. The maturity layer should remain weak.

## 4. Separate Cache Effects from Product Compression

Hypothesis: SkillCraft R8/cache and FinChain FC3 can be misleading if provider
cache behavior is mixed with genuine shorter reasoning trajectories. The
system needs a clearer paired accounting view before claiming compression.

Smallest experiment: add a diagnostic that separates raw input tokens, cached
input tokens, effective tokens, output tokens, wall-clock time, helper-call
count, and trajectory operation count for paired learned/control episodes. Do
not change R8, FC3, or the hard pass thresholds.

Verification:
- A paired report explains whether any improvement comes from actual shorter
  code/reuse trajectories or from cache artifacts.
- Existing scorecards still report FC3 and R8 exactly as before.
- The completion audit can cite the diagnostic to support either "compression
  proven" or "compression blocker remains".

Falsifier: if the diagnostic shows no meaningful reduction after removing
cache artifacts, document that as a blocker. Do not re-label it as success.

## 5. Clarify Generality Without Weakening FC4

Hypothesis: strict FC4 same-signature transfer is valuable but may be too
narrow to describe general code-mode harness generality. SkillCraft
`FANOUT(tool)` and FinChain `source(...)` can both exercise the same harness
mechanics while still correctly failing FC4.

Smallest experiment: add a diagnostic-only "workflow shape" summary derived
from code artifacts: call graph shape, typed helper input/output contract,
answer boundary, and replay/provenance contract. Keep it separate from FC4 and
do not let it make FC4 pass.

Verification:
- Scorecard or artifact walk reports strict FC4 unchanged.
- The diagnostic can explain within-benchmark and cross-shape harness reuse
without claiming same-signature transfer.
- Tests prove that overly broad matches do not count as FC4.

Falsifier: if the workflow shape mapping is too fuzzy to audit from files, do
not add it. Prefer leaving `generality` weak over adding a gameable abstraction.
