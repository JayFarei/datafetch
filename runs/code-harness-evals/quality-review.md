# Thermo-Nuclear Code Quality Review

Reviewed: 2026-05-22

Scope:

- `src/trajectory/recorder.ts`
- `src/cli/trajectoryGraph.ts`
- `src/cli/workspace.ts`
- `src/cli/workspaceArtifacts.ts`
- `src/sdk/frontmatter.ts`
- `src/discovery/librarySearch.ts`
- `src/observer/author.ts`
- `src/observer/worker.ts`
- `src/snippet/answer.ts`
- `src/trajectory/__smoke__.ts`
- `src/snippet/__smoke__.ts`
- `scripts/acceptance/intent-workspace.sh`
- workspace source/graph/replay artifacts and `HEAD` pointers
- SDK exports and CLI wiring
- Goal/reference/log artifacts under `runs/code-harness-evals/`
- `runs/code-harness-evals/completion-audit.md`
- `src/bootstrap/workspaceMemory.ts`
- `src/eval/productFlow/runProductFlowMicroEval.ts`
- productFlow workspace-lib prompt and mirrored workspace artifacts
- workspace `report.md` artifact and `HEAD.reportPath`
- report learning eligibility metadata
- replay/report observer-decision status and callability authority
- generated workspace-memory post-commit artifact map
- typed learning/governance summary construction
- append-only observer decision logging
- observer decision-log pointers in accepted workspace artifacts
- productFlow workspace-lib `df.answer(...)` prompt boundary
- productFlow prompt extraction and focused prompt tests
- productFlow answer-contract extraction and focused answer-contract tests
- productFlow agent-invocation extraction and focused argument/parsing tests
- generated workspace-memory namespace-boundary guidance
- generated workspace-memory helper-path and promotion-boundary guidance
- default workspace script type-reference breadcrumbs
- fallback mount code-native discovery and namespace-boundary guidance
- hook-governance visibility in `apropos` and `man`
- manifest-only `man` fallback for quarantined/non-resolving hooks
- Claude-backed live SkillCraft/FinChain probes
- SkillCraft verified-record-backed chain gate and scalar literal record rewrite
- Learned fan-out helper typed operational surfaces in `df.d.ts`, observer-authored helper templates, and shared server manifests
- ProductFlow workspace-lib pre-flight catalogue inspection prompt and live Claude helper-reuse proof
- FinChain FC4 cross-benchmark scoring from read-only artifact walks
- FinChain pure-compute learned-helper prompt, `df.d.ts`, trajectory-counter, and Claude reuse proof
- FinChain `codeModeHarness` product-alignment diagnostic layered beside FC1-FC5
- FinChain `codeModeHarness` anti-gaming thresholds and reuse-evidence split

## Findings

No remaining blocking maintainability findings after Attempt 42.

Thirty issues were found and fixed during review:

- The first scoped-parent implementation used nearest absolute call distance.
  That was too clever for the runtime invariant and could attach a scoped inner
  call to a previous invocation of the same helper if the real parent boundary
  followed several nested calls later. The implementation now uses the direct
  rule: prefer the first matching parent after the child, fallback to the last
  prior parent for legacy ordering. `src/trajectory/__smoke__.ts` now covers
  multiple scoped calls before one parent boundary.
- `src/cli/workspace.ts` had started absorbing the artifact subsystem after
  the source/graph/replay slices, reaching 916 lines. Artifact writing is now
  extracted to `src/cli/workspaceArtifacts.ts`, leaving `workspace.ts` focused
  on workspace creation, execution dispatch, and result orchestration.
- Rejected commit attempts previously overwrote `result/*` while leaving
  `HEAD.json` pointed at the prior accepted trajectory. `result/*` is now only
  updated after accepted validation; rejected attempts remain under
  `result/commits/N/`.
- Generated workspace memory had a stale `export default async function`
  example even though snippets are executed as flat wrapped bodies. The example
  now shows top-level `await` composition and `return df.answer(...)`, matching
  the actual commit contract.
- productFlow's workspace-lib path still re-listed tool bundles and substrate
  primitives in the task prompt, which weakened the claim that the workspace is
  the catalogue. The workspace-lib prompt now points at `AGENTS.md`, `df.d.ts`,
  and `lib/`, and the generated workspace memory carries the discovery
  contract.
- Hook-mode filtering hid runtime-callable seed primitives from `df.d.ts` while
  workspace memory could still advertise them. Seed primitives now remain
  visible in `df.d.ts` and workspace memory; tenant candidates still require
  hook callability.
- The workspace had strong individual artifacts but no single vendor-facing
  aggregate view. `report.md` now provides a Markdown entrypoint derived from
  source, answer, validation, graph, replay, and workspace snapshot artifacts.
- The first aggregate report omitted learning eligibility, forcing a reviewer
  to infer crystallisation context from JSON or runtime internals. `report.md`
  now includes phase, crystallisable flag, mode, and function name without
  claiming a final observer promotion decision.
- The report exposed eligibility but did not explicitly say whether a final
  observer decision was recorded or who owns callability. Replay/report
  artifacts now state `observerDecision: not-recorded-in-workspace-response`
  and `callabilityAuthority: hook-manifest`.
- Generated workspace memory covered pre-commit discovery but did not tell
  agents how to inspect the accepted HEAD after commit. It now points at the
  existing result/report/source/graph/replay artifacts and accepted-result
  semantics.
- Learning/governance artifact fields were assembled with repeated string
  literals in replay JSON and report Markdown. They now share a typed
  `WorkspaceLearningSummary` construction point.
- Observer outcomes were previously visible only as an in-process result or as
  a helper side effect. The observer now appends best-effort decision records to
  `observer/<tenant>/decisions.jsonl`, and generated workspace guidance points
  agents there without making the log a callability source.
- The new observer decision log was not reachable from accepted HEAD/replay
  inspection. `HEAD.json`, replay `learning`, readable replay, and `report.md`
  now include a datafetch-home-relative observer decision-log pointer.
- productFlow's workspace-lib prompt still asked for stdout JSON even though
  the product boundary and generated workspace memory use `df.answer(...)`.
  Workspace-lib prompts now rewrite legacy task wording into the typed answer
  boundary while leaving legacy non-workspace productFlow prompts unchanged.
- productFlow prompt policy had continued to live inside the large runner. It
  is now extracted into `src/eval/productFlow/prompt.ts`, with focused tests
  for workspace-lib `df.answer(...)`, prompt-leak resistance, legacy stdout
  prompts, and manifest-inline leak stripping.
- productFlow answer parsing and comparison policy had continued to live inside
  the large runner. It is now extracted into
  `src/eval/productFlow/answerContract.ts`, with focused tests for defensive
  async-IIFE unwrapping, legacy stdout JSON parsing, `df.answer(...).value`
  fallback, and canonical answer comparison.
- productFlow Claude invocation and JSON usage parsing had continued to live
  inside the runner. It is now extracted into
  `src/eval/productFlow/agentInvocation.ts`, with focused tests for `claude-p`
  versus standard Claude arguments, JSON result/cost/token parsing, and
  non-JSON stdout fallback.
- Generated workspace memory taught code-native discovery but did not state
  the namespace ownership boundaries explicitly. It now has a compact
  `Namespace Boundaries` section for `df.db`, `df.lib`, `df.tool`, and
  `df.answer`, with focused tests so the tenant/system split does not drift.
- Generated workspace memory blurred immediate helper code with durable tenant
  library promotion by naming `lib/<tenant>/` inside an intent workspace. It now
  tells agents to put answer-local helper code in `scripts/helpers.ts`, treats
  `lib/` as the mounted tenant library root, and keeps durable `df.lib.*`
  callability with validated observer promotion plus hook manifests.
- Generated workspace memory told agents to use TypeScript symbols/LSP, but
  default mounted scripts had no direct type-reference breadcrumb to `df.d.ts`.
  The default `scratch.ts`, `answer.ts`, and `helpers.ts` now start with a
  type-only `/// <reference path="../df.d.ts" />` line, so opening a script
  directly still connects to the generated code-mode contract.
- The fallback generic `datafetch mount` path had drifted behind generated
  workspace memory. When a catalog source had no template, agents received
  weaker `AGENTS.md` guidance that omitted code-native discovery, namespace
  boundaries, the `scripts/helpers.ts` helper path, and the durable
  observer-promotion boundary. The fallback text now carries the same compact
  contract and has a focused CLI regression.
- `apropos` and `man` used the hook manifest for ranking/filtering, but did not
  show the manifest's callability/maturity to the agent. That made a discovery
  result look more authoritative than it was. Search results and man pages now
  render hook governance from existing manifests, including quarantine details,
  and not-callable JSON invocations are marked as diagnostic without changing
  the hook decision itself.
- `apropos` could surface a quarantined helper whose implementation no longer
  resolved, but `man <name>` then returned no manual entry. That broke the
  Unix discovery chain at the exact moment the agent needed governance context.
  `man` now falls back to the hook manifest and renders a diagnostic
  governance-only page without changing runtime callability.
- The first Claude SkillCraft live probe produced an official evaluator pass
  but was still marked `runtime_error` because the substrate-rooted chain gate
  treated supporting/category records as mandatory entity provenance. The gate
  now applies only when mounted records verify a tool-callable entity fan-out;
  prompt text mirrors that distinction, and scalar literal entity arrays are
  rooted through `df.db.records` only when their values actually match records.
- Learned pure `toolFanout` and `toolFanoutEnrichment` helpers were advertised
  as intent-shaped `Object` calls in some TypeScript surfaces, which left the
  agent to infer operational fields or retry raw tool loops. SkillCraft and the
  shared server manifest now render the full operational call shapes, and the
  observer-authored helper templates/frontmatter describe the helpers as typed
  and parameterised.
- Candidate-only hook mode could expose learned helpers as callable in
  SkillCraft `df.d.ts`, producing a late runtime rejection when Claude did the
  right thing and called the helper. Learned live helpers are now filtered out
  of callable declarations in `hooks-candidate-only`; hooks-draft still exposes
  callable-with-fallback helpers and the live Claude e3 probe proves reuse.
- ProductFlow's workspace-lib prompt pointed at `df.d.ts`/`lib/`, but did not
  explicitly require a pre-flight catalogue inspection before writing
  `scripts/answer.ts`. The prompt now requires that inspection and tells the
  agent to prefer a matching learned library declaration for repeated
  entity/tool fan-out, without leaking concrete helper names into the task
  prompt.
- FinChain FC4 was left as a conditional note even when the run already had
  enough artifact evidence to prove a non-pass. The FinChain artifact walker
  now writes the walked trajectory rows it had already computed, and
  `score-finchain.ts` compares FinChain lib-call intent signatures with
  SkillCraft helper-call intent signatures from the existing
  `helper-instrumentation.jsonl`.
- FinChain's learned-helper workspace surface was internally inconsistent:
  validated helpers learned during a run were not announced to later episodes,
  examples did not show the required Result-envelope `.value` unwrap, and
  `df.d.ts` typed learned helpers as `Promise<number>` even though `df.lib`
  returns `{ value: number }`. The prompt also still carried an old instruction
  to avoid `df.answer`, contradicting the typed answer boundary. The runner now
  announces all validated helpers, examples unwrap `.value`, the TypeScript
  declaration matches the runtime envelope, the prompt consistently returns
  `df.answer({...})`, and saved trajectories drive the measured
  `libFunctionsUsed` counter.
- The rubric had started to conflate hard benchmark success with product
  architecture progress. FC3 and FC4 must remain strict, but they do not fully
  measure whether repeated intents become typed, discoverable, governed tenant
  code under saturated correctness. `score-finchain.ts` now emits an additive
  `codeModeHarness` diagnostic that reports safety, code-mode contract
  evidence, learning-loop reuse, compression, library maturity, and generality
  without changing FC1-FC5 semantics.
- The first `codeModeHarness` diagnostic still used pass-like language and
  could overclaim from one prompt-directed warm reuse or a tiny positive cost
  delta. The diagnostic now uses `proven | weak | blocked`, requires minimum
  paired and warm-reuse opportunities, requires at least 10% token-or-wall
  reduction for proven compression, reports prompt-directed reuse separately
  from filesystem-discovered and held-out discovered reuse, and keeps helper
  maturity weak unless replay/change/verifier/rollback contracts are present.

## Approval Rationale

- The graph is derived from existing typed trajectory calls; it is not written
  into trajectory JSON and does not create a second source of truth.
- The new CLI command is isolated in `src/cli/trajectoryGraph.ts` rather than
  adding more branching into `src/cli.ts`.
- Workspace `graph.txt` files are derived views colocated with `lineage.json`.
  They improve VFS discovery without making JSON or a dashboard the product
  surface.
- Tool declarations moved into `src/runtime/toolCatalog.ts`, the canonical
  tool-catalog module, and SkillCraft now reuses that renderer instead of
  carrying a bespoke copy.
- Learned-helper contracts reuse source headers rather than a new metadata
  store: declared frontmatter remains the `datafetch man`/discovery surface,
  and validator-stamped `@...` annotations are the only fields the eval counts
  as maturity evidence.
- Answer assumptions extend the existing `df.answer(...)` type and replay
  summary. They are optional and do not add validation branches or evaluator
  exceptions.
- Readable replay summaries are derived from the existing replay object and
  written next to `tests/replay.json`. They improve VFS discoverability without
  changing replay evaluation or acceptance semantics.
- Source snapshot pointers and hashes are derived from the existing `source.ts`
  artifact and source text. They make source identity easier to verify without
  changing execution, observer promotion, or evaluator behavior.
- The artifact writer split is a plain ownership boundary: it did not introduce
  a registry, service, background index, or alternate artifact format.
- Accepted result preservation after rejection removes an ambiguity rather than
  adding a new surface. The rejected attempt is still fully inspectable through
  append-only commit history.
- Code-native discovery guidance lives in generated `AGENTS.md`, not a new
  index, registry, or dashboard. It names existing file/system tools and the
  existing TypeScript manifest.
- productFlow accepts `df.answer(...).value` as a diagnostic output source, but
  keeps legacy stdout parsing. This aligns the diagnostic with the product
  answer boundary without invalidating prior stdout-shaped runs.
- `report.md` is generated by the existing workspace artifact module and points
  back to sibling files. It is intentionally not a registry, cache, or alternate
  persistence format.
- The report `Learning` section contains runtime response metadata only. Hook
  manifests still decide final helper callability.
- The observer-decision line is an explicit absence marker. It avoids a new
  registry while preventing readers from mistaking eligibility for promotion.
- The workspace-memory addition is navigational guidance over existing files,
  not another catalogue or policy layer.
- Replay/report governance strings are now emitted from one helper, so future
  changes to observer-decision or callability wording cannot silently diverge
  between artifacts.
- The observer decision log lives under the existing observer state directory,
  is append-only, and is best-effort. It adds inspectable evidence for skipped
  and crystallised outcomes without becoming a registry or promotion authority.
- The observer decision-log pointer is derived from tenant id and rendered by
  the existing workspace artifact module. It is navigational metadata, not a
  copied decision, cache, or alternate callability source.
- The productFlow prompt change is scoped to the workspace-lib diagnostic and
  reuses the existing scorer's support for `run.answer.value`. It does not add
  helper-name steering, benchmark-specific defaults, or evaluator relaxation.
- The prompt extraction reduces the runner from 1434 to 1149 lines and gives
  the prompt contract a direct unit test. The new module is pure rendering and
  leak-checking; it does not take over execution, scoring, or substrate setup.
- The answer-contract extraction further reduces the runner to 1030 lines and
  gives stdout/envelope compatibility a direct unit test. The new module is
  pure source normalization and value comparison; it does not take over
  runtime execution, observer wiring, or scoring artifact writing.
- The agent-invocation extraction reduces the runner to 879 lines and gives
  Claude CLI argument and usage/cost parsing a direct unit test. The new module
  owns process mechanics; it does not take over substrate setup, workspace
  mirroring, snippet execution, scoring, or artifact policy.
- The namespace-boundary guidance lives in generated `AGENTS.md`, not a new
  registry or prompt catalogue. It clarifies the existing typed surface:
  system/provider data in `df.db`, tenant-learned code in `df.lib`, governed
  adapters in `df.tool`, and the commit boundary in `df.answer`.
- The helper-path guidance also lives in generated `AGENTS.md`. It removes a
  misleading nested path, keeps immediate answer-local helpers in `scripts/`,
  and reinforces that tenant `df.lib.*` reuse must be visible through the typed
  manifest and hook callability boundary.
- The script reference breadcrumb is deliberately smaller than adding a
  `tsconfig.json`. A normal TS project config would mis-typecheck snippet
  top-level `return`; the triple-slash reference improves editor navigation
  without changing runtime semantics.
- The fallback mount guidance reuses the same existing filesystem and typed
  namespace contract as generated workspace memory. It avoids a second index or
  host-owned catalogue, and it leaves runtime callability with observer
  promotion plus hook manifests.
- Hook-governance rendering is a projection over existing hook manifests. It
  improves the Unix discovery surface, removes duplicate `apropos` text
  formatting between CLI and VFS, and does not change hook filtering,
  promotion, quarantine, or runtime invocation behavior.
- The manifest-only man fallback reuses the existing hook manifest reader and
  the same renderer. It does not add another index, does not synthesize a
  callable schema, and does not make a quarantined implementation executable.
- The SkillCraft gate change is a contract tightening, not a scorer bypass:
  the official evaluator still decides correctness, the gate still rejects raw
  tool fan-out for verified record-backed fan-out tasks, and category/support
  records no longer force fake `df.db` contact.
- The learned fan-out declaration change is a typed-surface fix, not another
  registry. It renders the actual callable parameters in `df.d.ts` and keeps
  callability with hook manifests.
- The ProductFlow prompt change is a discovery instruction over existing
  workspace files. It preserves the no-helper-name-leak rule and was falsified
  with a live Claude run before being kept.
- The FC4 scorer change is a read-only join over existing walker artifacts. It
  does not add a new runtime path, helper source, benchmark branch, or metric
  exception; it turns an unknown FC gate into measured evidence.
- The FinChain pure-compute change is a typed-surface correction over the
  existing workspace files and existing opt-in pure-compute gate. It does not
  relax scorers, preseed a measured helper, or bypass hook/quarantine
  promotion; the live Claude v4 run shows the helper was crystallised and then
  selected from the tenant library.
- The `codeModeHarness` section is an additive diagnostic. It does not alter
  FC3 or FC4 pass/fail calculation, and it explicitly reports FC strict
  generality separately from product-level learning-loop progress.
- The anti-gaming rubric hardening makes the diagnostic less flattering on the
  current slice: `overallStatus` is `weak`, with only benchmark safety proven.
  That is preferable to overclaiming from a tiny sample.
- No newly introduced file crosses the 1k-line threshold, and the existing
  large authoring module was not made structurally worse. Current relevant
  file sizes:
  `src/trajectory/recorder.ts` 345 lines, `src/cli.ts` 512 lines,
  `src/cli/trajectoryGraph.ts` 175 lines,
  `src/cli/workspace.ts` 597 lines,
  `src/cli/workspaceArtifacts.ts` 535 lines,
  `src/sdk/frontmatter.ts` 132 lines,
  `src/discovery/librarySearch.ts` 623 lines,
  `src/observer/author.ts` 2404 lines,
  `src/observer/worker.ts` 439 lines,
  `src/snippet/answer.ts` 282 lines,
  `src/trajectory/__smoke__.ts` 173 lines,
  `src/snippet/__smoke__.ts` 470 lines,
  `src/runtime/toolCatalog.ts` 172 lines,
  `src/server/manifest.ts` 417 lines,
  `src/cli/agentVerbs.ts` 251 lines,
  `src/bash/commands/apropos.ts` 71 lines,
  `src/bootstrap/workspaceMemory.ts` 549 lines,
  `src/eval/productFlow/runProductFlowMicroEval.ts` 879 lines,
  `src/eval/finchainFullDatafetch.ts` 1202 lines,
  `src/eval/skillcraftFullDatafetch.ts` 4527 lines,
  `eval/finchain/scripts/score-finchain.ts` 742 lines,
  `eval/finchain/scripts/walk-artifacts.ts` 468 lines,
  `src/eval/productFlow/prompt.ts` 251 lines,
  `src/eval/productFlow/answerContract.ts` 133 lines,
  `src/eval/productFlow/agentInvocation.ts` 174 lines,
  `tests/runtime-toolCatalog.test.ts` 128 lines,
  `tests/hooks/manifest-rendering.test.ts` 280 lines,
  `tests/workspace-memory.test.ts` 150 lines,
  `tests/observer-workspace-head.test.ts` 168 lines,
  `tests/productflow-prompt.test.ts` 71 lines,
  `tests/productflow-answerContract.test.ts` 63 lines,
  `tests/productflow-agentInvocation.test.ts` 80 lines,
  `tests/discovery-librarySearch.test.ts` 220 lines,
  `tests/cli-plan-execute.test.ts` 714 lines,
  `tests/skillcraft-full-datafetch-planner.test.ts` 1368 lines,
  `tests/observer-author.test.ts` 888 lines,
  `tests/finchain-scorecard.test.ts` 188 lines,
  `tests/finchain-workspace-surface.test.ts` 64 lines,
  `scripts/acceptance/intent-workspace.sh` 183 lines.
- No benchmark-specific branches, scorer changes, prompt metric steering,
  bypasses, or hidden registry behavior were introduced.
- The changes improve filesystem/code-mode inspection without changing
  `df.db`, `df.lib`, `df.tool`, or `df.answer` runtime behavior.
- The completion audit is a proof-status artifact only. It does not change
  runtime behavior, evaluator policy, or the product abstraction.

## Residual Risk

- `datafetch graph` is a run-shape projection, not a full data-dependency
  graph. It should not be over-marketed as semantic provenance yet.
- `tests/replay.txt` is a readable replay summary, and `sourceHash` is source
  identity metadata; neither is a proof stronger than the underlying source,
  replay JSON, trajectory, and evaluator result.
- `src/cli/workspaceArtifacts.ts` is intentionally a focused artifact module.
  If it grows toward broad policy decisions, split replay rendering or lineage
  projection instead of putting that logic back into `workspace.ts`.
- `report.md` duplicates summary facts by design. If a conflict appears, treat
  sibling JSON/source artifacts as authoritative and fix the report renderer.
- The report `Learning` section is eligibility metadata, not a final observer
  decision. Final helper callability remains owned by hook manifests.
- Consumers that previously looked at `result/validation.json` after a rejected
  commit must now inspect the command envelope or `result/commits/N/`; this is
  the intended contract because `result/*` represents accepted HEAD.
- `src/observer/author.ts` remains a pre-existing giant file at 2372 lines.
  This slice added only the contract stamp helper, but future authoring work
  should extract frontmatter generation before adding more branches there.
- The current proof is local tests plus small live Claude harness/probe checks.
  Full live SkillCraft/FinChain bilateral evals were not run in this slice.
- SkillCraft full adapter readiness remains a pre-existing warning.
- `completion-audit.md` should be kept current if the guard is fixed and live
  eval proof is added; stale audit status would be misleading.
- The shared tool renderer currently types tool outputs as `unknown` and carries
  response-shape hints in JSDoc. That is intentional for this slice; richer
  output schemas should be a separate eval-backed iteration.
- `src/eval/productFlow/runProductFlowMicroEval.ts` is now below 1k lines.
  Prompt, answer-contract, and agent-invocation policy are extracted; future
  productFlow changes should split episode setup/execution before adding more
  responsibilities to the runner.
- `src/eval/skillcraftFullDatafetch.ts` remains a very large pre-existing
  runner at 4527 lines. This slice kept the gate/prompt/source-prep policy in
  the canonical SkillCraft runner to avoid a broad extraction during eval
  proof, but future SkillCraft work should extract prompt rendering and source
  preparation before adding more branches there.
- `src/eval/finchainFullDatafetch.ts` is now over 1k lines at 1202. This turn
  added exported prompt/type rendering and trajectory-derived counters because
  they were required to prove the Claude eval path without changing scorer
  policy. The next FinChain change should extract prompt/type surface rendering
  before adding more runner branches.
- The live Claude SkillCraft/ProductFlow slices prove learned fan-out reuse in
  fixed warm episodes, but they do not prove that every convergent intent shape
  will select the learned helper. Broader eval coverage should keep measuring
  helper reuse separately from answer correctness.
- FinChain FC4 is now measured for the small paired slices. The latest
  pure-compute run does call a learned `df.lib.*` helper, but FC4 remains false
  because the called finance signature is source-derived and does not match
  SkillCraft's `FANOUT(tool)` signature. That is useful evidence, not a product
  success claim.
- The new code-mode harness diagnostic should stay diagnostic until broader
  SkillCraft/FinChain evidence exists. If future code starts using it to bypass
  FC failures, that would be a rubric regression.
- `codeModeHarness` still depends on what artifacts expose. Filesystem
  discovered reuse remains blocked until prompt/trace evidence records actual
  agent inspection of `AGENTS.md`, `df.d.ts`, `lib/`, `man`, or `apropos`.
- The observer decision log is append-only evidence. If consumers need
  per-workspace surfacing later, add a derived pointer or report section, not a
  second callability source.
- `observerDecisionLogPath` is relative to the datafetch home, not the
  workspace root. Consumers should combine it with `.datafetch/workspace.json`
  `baseDir` or the active `DATAFETCH_HOME` when opening the file.

Decision: acceptable as a narrow architecture slice. Broader helper-maturity or
promotion-policy changes should be separate eval-backed iterations.

## Independent review of the maturity-contract slice (Attempt 47)

This review re-examined the committed discovery-evidence and maturity-contract
commits (`6b7fc90e9`, `82d544c41`) from a fresh session and ran the live
end-to-end proof. Findings:

- `src/eval/codeModeDiscoveryEvidence.ts` is a single pure function with small
  named helpers, no I/O, and a conservative default: `status` is `proven` only
  when an ordered event trace shows code-surface inspection before a helper
  call, otherwise `blocked`. It does not infer discovery from the mere
  existence of `df.d.ts`. Clean and not gameable.
- The walker's contract handling cleanly separates two tiers:
  `declared-frontmatter` (constant boilerplate the author paths emit for
  `man`/`apropos` code-native discovery) versus `validated-header` (the
  `@`-prefixed evidence the quarantine validator stamps only after origin and
  held-out replay pass). `contractSource` records which tier applies, and the
  scorer credits `helpersWithContracts` only for `validated-header`. This is
  the correct anti-gaming boundary: boilerplate cannot inflate maturity.
- `buildMaturityContractLines`/`applyMaturityContract` are pure string
  transforms, unit-tested, and used only on the validator's promotion branch,
  so the contract evidence cannot be written without a passing replay.
- The new walker helpers (`scalarFrontmatter`, `annotationValue`) reuse the
  existing `escapeRegExp` and `parseFrontmatterFields`; no new store, registry,
  or duplicate parser was introduced. `HelperHeader` gained nine fields, which
  is verbose but each is independently inspectable in `artifact-walk.json`.
- No file crossed the 1k-line threshold from this slice; no benchmark-specific
  branch, scorer relaxation, prompt metric steering, or hook/quarantine bypass
  was added.

Residual risk: `libraryMaturity: proven` on the Attempt 47 slice rests on a
single replay-validated helper. The `proven` status is honest for that helper's
contract evidence, but maturity at scale (many helpers, all contracted) and the
safety/compression/learning-loop layers still require larger paired/warm-reuse
runs, which is why those layers correctly stayed blocked/weak.

Decision: the discovery-evidence and maturity-contract slices stayed simple and
maintainable, and the live run proves the promotion-time contract path
end-to-end. Accept. Remaining FC3/FC4/R8 and full-bilateral proof are documented
blockers, not quality defects.

## Review of the stream-json discovery trace (Attempt 49, commit 54342f0b7)

- The agent-invocation change is contained: `runClaudePAgent` switches to
  `--output-format stream-json --verbose` and delegates result/usage extraction
  to a pure, exported `parseAgentStdout`. That parser handles both the legacy
  single-object json output and the NDJSON stream (it picks the
  `{"type":"result"}` line), so the format switch cannot silently zero out
  token accounting. It has four focused unit tests covering json mode,
  stream mode, non-JSON fallback, and empty input.
- Correctness is structurally unaffected: the FAC result comes from executing
  `scripts/answer.ts`, not from the agent's final message. The fresh live slices
  confirm all seeds stayed `fac=true` after the switch.
- `events.jsonl` is written from the same stdout the runner already captured;
  no second agent invocation, no new persistence format beyond one NDJSON file
  the walker already knew how to read.
- The walker change tightens, rather than expands, the discovery-evidence
  surface: it now reads ordered streams only and explicitly drops the summary
  files (`agent-stdout.txt`, `agent-run.json`) that contain the final answer.
  This removes a latent correctness bug — those summaries would have injected a
  premature helper-call into the ordering and could wrongly block (or, in other
  orderings, wrongly prove) discovery. The comment documents why.
- No file crossed the 1k-line threshold from this change, no scorer threshold
  moved, and the analyzer (`codeModeDiscoveryEvidence.ts`) was untouched — it
  was already conservative and correct; it simply had no ordered input before.

Residual risk: discovery-evidence quality now depends on `claude-p` continuing
to emit a well-formed stream-json trace. If a future CLI change alters the event
shape, `parseAgentStdout` still degrades safely (falls back to raw text / zero
usage) and the analyzer returns `blocked` rather than a false positive.

Decision: accept. The change proves the VFS-first discovery claim with live
evidence while staying small, pure-testable, and non-gameable.
