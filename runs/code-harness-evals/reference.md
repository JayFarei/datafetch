# Code Harness Alignment Reference

This reference anchors the implementation goal for maturing datafetch with
the "Code as Agent Harness" paper while preserving the product shape that
emerged from eval-driven development.

This is not a directive to copy the paper as a harness feature. The goal is
to internalize its crisp design principles, simplify our architecture where
the repo has accumulated friction, and prove any change against the existing
eval families.

## Sources

- Paper: https://arxiv.org/html/2605.18747v1
- Cloudflare Agents Code Mode: https://developers.cloudflare.com/agents/api-reference/codemode/
- Repo architecture surfaces: `src/server/manifest.ts`,
  `src/snippet/dfBinding.ts`, `src/snippet/runtime.ts`,
  `src/trajectory/recorder.ts`, `src/observer/`, `src/bash/`,
  `src/cli/workspace.ts`, `src/discovery/librarySearch.ts`
- Eval surfaces: `eval/skillcraft/`, `eval/finchain/`, `eval/productFlow/`,
  `experiments/PLAN.md`

## Paper Principles To Internalize

The paper frames code as the agent harness: code is the executable,
inspectable, stateful medium through which agents reason, act, observe
feedback, preserve state, verify progress, and coordinate with other agents.

The most relevant principles for datafetch are:

- Code is an operational substrate, not just generated output.
- A harness includes typed APIs, sandboxes, memory/state, validators,
  permission boundaries, execution loops, and feedback channels.
- Reliable agents need a Plan-Execute-Verify loop: the plan states intended
  state changes and validation criteria; execution happens in a governed
  workspace; verification uses deterministic sensors, tests, evals, or
  human gates.
- Memory should be treated as governed program state, not as more context.
- Deep telemetry is the substrate for harness improvement: prompts, source,
  tool calls, file edits, command outputs, costs, tests, rejected paths, and
  branch decisions should be connected enough to support replay and review.
- Harness mutation must be evidence-carrying: every change needs a change
  contract, invariants, held-out regression surfaces, and a rollback path.
- Multi-agent coordination should converge through shared program state,
  read/write sets, assumptions, version dependencies, verifier obligations,
  and conflict policy; chat logs alone are not enough.
- Context management is the tax paid when shared harness state is implicit.

## Current Datafetch Understanding

Datafetch is already close to a code-harness system.

The tenant workspace is the user-visible harness. `datafetch mount` creates a
normal filesystem workspace with `.datafetch/`, `scripts/`, `tmp/runs/`,
`result/`, `df.d.ts`, `db/`, and `lib/`. Agent instructions tell the model to
inspect `AGENTS.md`, `df.d.ts`, mounted data, `lib/`, `datafetch apropos`,
and `datafetch man`, then commit `scripts/answer.ts` with `df.answer(...)`.

There is also an in-process bash VFS path: mounted `/db/<mount-id>` is
read-only, `/lib` is a writable tenant overlay, and bash-native commands such
as `man` and `apropos` expose capability discovery. This is not currently a
kernel/FUSE filesystem; it is a normal worktree plus a `just-bash`
`MountableFs` runtime for the bash path.

`df.d.ts` is the code-mode manifest. It exposes typed namespaces, mirroring
Cloudflare's idea that agents should interact through code rather than JSON
tool descriptors. The normal manifest includes `df.db`, `df.lib`,
`df.answer`, and `df.run`. Runtime also supports `df.tool`; that surface is
currently broader than the generic manifest and should be made explicit only
if doing so improves reliability without confusing tenant discovery.

A trajectory is not JSON. JSON is only persistence. The trajectory is:

- the executed TypeScript source snapshot and hash;
- the typed `df.*` primitive call graph;
- the answer transaction;
- validation and replay evidence;
- artifact metadata;
- observer/promotion decisions.

`df.answer(...)` is the commit boundary. It should remain a typed write
operation with structured evidence, visible derivation, lineage, status, and
no default-zero fallback. It must not become a bypass around real `df.db`,
`df.lib`, or `df.tool` calls.

`df.lib` is the warm-path product surface. Tenant libraries are typed
TypeScript `fn(...)` files with input/output schemas, examples, provenance,
runtime validation, and result envelopes. Learned behavior should become
callable tenant code, not hidden router state.

Observer/crystallisation is the learning loop. Saved trajectories are gated,
deduped, checked for substrate-rooted data flow and repeated intent shapes,
then converted into tenant-local helpers through validated authoring and hook
registry/quarantine callability.

## Principles To Preserve

- VFS and filesystem-first discovery stay central. Agents should discover
  progressively with `ls`, `cat`, `rg`, source inspection, `df.d.ts`,
  `datafetch apropos`, and `datafetch man`.
- Code mode is the interface. Agents externalize cognition as TypeScript
  programs and typed calls, not as opaque planner JSON.
- `df.db` is the system/provider dataset surface.
- `df.lib` is the tenant-level learned library surface.
- `df.tool` is a governed adapter/tool bridge, not a replacement for the
  tenant library.
- `df.answer` is the answer/commit/eval boundary.
- Cold `df.db` composition remains a normal fallback when no tenant helper
  fits. Falling back is not a failure; silent bad reuse is.
- Tenant locality is load-bearing. Promotion into shared or seed libraries
  must be a later, separately governed step.
- Hook manifests own public callability. A `.ts` file on disk is evidence;
  registry state decides callable, fallback-callable, or quarantined.
- The architecture should become simpler through this work: delete or clarify
  concepts before adding new layers.

## Evaluation Baselines

SkillCraft is the mature learning-honesty baseline. It uses cold creation on
e1 and held-out reuse/generalization on e2/e3/m1/m2/h1. Official pass/fail is
the evaluator, not `df.answer` self-validation. Preserve or improve R1-R9,
especially correctness, effective tokens, runtime error rate, quarantine,
convergence, conditional reuse, dual-gated cost drop, and cross-shape
transfer.

FinChain is the cross-benchmark generality surface. It maps finance-chain
template instances onto the same runner shape and adds FAC, step alignment,
substrate-ON vs OFF paired improvement, cross-benchmark transfer, and
SkillCraft bilateral non-regression. Preserve R1-R9 and pass FC1-FC5.

productFlow is an off-benchmark architecture diagnostic, not the final gate.
It showed that discovery infrastructure transfers, but thin auto-authored
helpers and weak directive steering block reliable reuse. Use it to test
helper richness, composition-density policy, directive quality, and prompt
leak resistance.

## Allowed Levers

- Make the typed trajectory program more explicit as a read/compute/write
  graph without changing the core TypeScript trajectory model.
- Improve code-native navigation over committed trajectories and helpers:
  symbols, refs, graph, replay, provenance, or equivalent names that fit the
  CLI style.
- Make `df.tool` visibility coherent if repo evidence shows this reduces
  confusion and preserves `df.db`/`df.lib` boundaries.
- Strengthen auto-authored helpers with typed input schemas, richer examples,
  better provenance, composition-density gates, and maturity metadata.
- Add replay/change-contract metadata for learned helpers: source trajectory,
  input/output schemas, read/write assumptions, verifier obligations, eval
  provenance, and rollback/quarantine state.
- Improve workspace-memory/directive packaging so agents naturally inspect
  `lib/`, `df.d.ts`, `man`, and `apropos` before deriving from scratch.
- Add small probes before full runs; only escalate after evidence supports
  the hypothesis.

## Forbidden Shortcuts

- Do not weaken evaluators, scorer thresholds, or rubric interpretation.
- Do not add benchmark/family/topic/template-name branches.
- Do not preseed measured helpers for the eval split.
- Do not steer metrics with prompt-only helper-name leaks.
- Do not bypass hook registry or quarantine.
- Do not add benchmark-shaped unwrap keys, defaults, or special answer logic.
- Do not replace code-mode discovery with a hidden host-owned registry.
- Do not introduce JSON trajectory as the product abstraction.
- Do not add abstractions that make warm reuse less inspectable from the
  filesystem.

## Completion Policy

Work in a dedicated git worktree. Before any expensive step or agent fan-out,
run the Codex lazyusage 5h guard and use `used_pct` as the hard signal:
stop at `>= 95`, avoid new large work at `>= 90`, and treat fallback, stale,
or errored readings as unreliable.

Every architecture iteration should state one hypothesis, make the smallest
generic substrate change that could prove it, run a targeted probe, and record
the evidence in `runs/code-harness-evals/log.md`. Prefer falsifying weak
ideas early over expanding scope.

Success requires a simple, repo-grounded change set that preserves SkillCraft
R1-R9, passes FinChain R1-R9 plus FC1-FC5 or explains a concrete blocker, and
produces productFlow-style evidence that helpers are discovered through the
workspace/code surface rather than prompt leakage. If no change clears that
bar, ship an evidence-backed falsification report instead of speculative code.

End with typecheck/tests, eval evidence, and a thermo-nuclear code quality
review focused on structural simplicity, abstraction quality, file size,
spaghetti-condition growth, and whether the shipped design is easier to
understand than the starting point.

## Team Operating Model

The paper's multi-agent lesson is not "spawn agents for ceremony"; it is that
coordination should converge through shared program state. For datafetch, that
means every agent role should read and write the same repo artifacts: `df.d.ts`,
tenant `lib/` code, trajectories, eval outputs, the run log, and typed tests.

Use this topology when the Codex usage guard is reliable and below threshold:

- Architect: owns the product boundary, keeps VFS/code-mode/tenant-lib
  principles intact, and rejects harness-shaped complexity that does not make
  the system simpler.
- Explorer: maps current code and eval behavior from file evidence.
- Implementer: edits a disjoint slice and leaves directly runnable tests.
- Verifier: runs targeted probes and reports output without changing scorers.
- Reviewer: applies the thermo-nuclear simplicity bar before anything ships.

If lazyusage is missing, stale, fallback, errored, or at/above the threshold,
do not fan out. Continue locally on small work or stop and record the blocker.

## Implemented Architecture Slices

1. Trajectory navigation became more code-like without making trajectory JSON
   the product model. The low-risk move is a typed derived graph over existing
   primitive calls plus `df.answer`, exposed through the SDK and a Unix-style
   `datafetch graph` command. The graph is derived from `calls`; it is not a
   second persisted source of truth.

2. Governed external tools are now renderable into the same typed code-mode
   manifest as `df.db` and `df.lib`. The shared `ToolCatalogEntry[]` shape still
   writes `tool_manifest.json` as a fallback, but the primary discovery surface
   can now be `df.d.ts`. SkillCraft and productFlow both read from the shared
   renderer instead of maintaining separate tool declaration logic.

3. Workspace run/commit artifacts now write a readable `graph.txt` beside
   `lineage.json` and point accepted `result/HEAD.json` at it. This keeps the
   graph discoverable through the VFS itself, not only through a CLI command.

4. Learned helper frontmatter now carries a small trust contract: source hash,
   replay contract, change contract, verifier obligation, and rollback path.
   `datafetch man` renders those fields as a `CONTRACT` section alongside
   schemas and examples, so warm-path reuse remains inspectable from code and
   filesystem discovery.

5. `df.answer(...)` now has an optional `assumptions` field in the typed answer
   contract, and workspace replay records whether assumptions were present. This
   gives agents a first-class place to externalize uncertainty without making
   assumptions mandatory for all accepted answers.

6. Workspace replay evidence now has a readable `tests/replay.txt` summary next
   to `tests/replay.json`, and accepted `result/HEAD.json` points to it through
   `replaySummaryPath`. This keeps replay expectations, validation decisions,
   assumptions, and call lineage visible through `ls`/`cat` instead of requiring
   JSON inspection as the first move.

7. Accepted workspace `HEAD.json` now also points to `source.ts` through
   `sourceSnapshotPath` and carries the SHA-256 `sourceHash`; replay JSON/text
   mirrors those fields. This makes the committed TypeScript source snapshot as
   discoverable as the graph and replay evidence, matching the core idea that a
   trajectory is source plus typed calls plus validation/replay, not just a JSON
   record.

8. Workspace artifact writing now lives in `src/cli/workspaceArtifacts.ts`
   instead of being embedded in `src/cli/workspace.ts`. This keeps the CLI
   workspace command focused on materialisation/orchestration while giving the
   source/graph/replay/HEAD contract a single focused module to review.

9. Accepted workspace `result/*` is now coherent with `result/HEAD.json`.
   Rejected commit attempts are still fully recorded under
   `result/commits/N/`, but they no longer replace the current accepted
   `result/` view. This preserves the Unix-friendly rule that `cat
   result/answer.json`, `cat result/graph.txt`, and `cat result/tests/replay.txt`
   describe the accepted HEAD, while rejected cognition remains available in
   append-only history.

10. Workspace memory now teaches code-native discovery directly. Generated
    `AGENTS.md` includes `ls`, `find`, `rg`, `cat`, TypeScript symbol/LSP
    navigation, `datafetch apropos`, and `datafetch man` as the normal way to
    discover callable surfaces. The example committed answer was corrected from
    a stale `export default` module shape to the actual flat snippet shape that
    returns `df.answer(...)`.

11. productFlow's workspace-lib diagnostic now exercises the intended shape
    more closely: the prompt points at `AGENTS.md`, `df.d.ts`, and `lib/`
    instead of reproducing the callable catalogue in prompt text; scoring accepts
    `df.answer(...).value` as well as legacy stdout JSON; and runtime-callable
    seed primitives remain visible in `df.d.ts` under hook modes while tenant
    candidates remain governed by hook callability.

12. Accepted workspaces now include a vendor/reviewer-facing aggregate report at
    `result/report.md`, with per-attempt copies under `result/commits/N/`.
    `HEAD.json` points to it through `reportPath`. The report is derived
    Markdown over existing artifacts: source hash, answer/validation state,
    artifact pointers, replay contract, and the readable trajectory graph.

13. The aggregate report now includes a `Learning` section with runtime response
    eligibility fields: phase, crystallisable flag, mode, and function name.
    This makes the observer/promotion boundary visible in the same filesystem
    entrypoint without treating the report as a hook registry or final
    callability decision.

14. Replay and report artifacts now state the governance boundary explicitly.
    They record learning eligibility, `observerDecision:
    not-recorded-in-workspace-response`, and `callabilityAuthority:
    hook-manifest`. This keeps vendor visibility high while making clear that
    final helper promotion/callability is outside the report and remains owned
    by hook manifests.

15. Generated workspace memory now includes a post-commit inspection path. It
    tells agents to read `result/HEAD.json` and `result/report.md` first, treat
    `result/` as the accepted HEAD view, inspect `result/source.ts`,
    `result/graph.txt`, and `result/tests/replay.txt`, and keep hook manifests
    as the final `df.lib.*` callability authority.

16. Observer decisions now have an append-only filesystem trail under
    `observer/<tenant>/decisions.jsonl`. Replay/report artifacts still expose
    workspace learning eligibility, and hook manifests remain the final
    callability authority. The decision log gives skipped/crystallised outcomes
    durable evidence without adding a registry or dashboard.

17. Accepted workspace artifacts now point at that observer decision trail.
    `result/HEAD.json` carries `observerDecisionLogPath`, replay `learning`
    carries the same path, and readable replay/report text renders
    `observerDecisionLog: observer/<tenant>/decisions.jsonl`. This keeps the
    asynchronous observer outcome discoverable from the accepted HEAD while
    leaving final helper callability with hook manifests.

18. productFlow's workspace-lib diagnostic now uses the same typed answer
    boundary as the product. The workspace-lib prompt rewrites legacy
    "print JSON" task wording into `df.answer({ status: "answered", value })`
    and the skeleton returns `df.answer(...)`. Helper names still live in the
    mirrored workspace (`df.d.ts`, `AGENTS.md`, `lib/`), not in the task prompt.

19. productFlow prompt policy is now a small testable module rather than
    another responsibility inside the runner. `src/eval/productFlow/prompt.ts`
    owns prompt rendering and helper-name leak checks; the runner still owns
    substrate setup, execution, scoring, and artifact writing. A focused test
    locks in workspace-lib `df.answer(...)`, prompt-leak resistance, legacy
    stdout behavior outside workspace-lib, and manifest-inline stripping.

20. productFlow answer-contract policy is now a small testable module rather
    than hidden runner code. `src/eval/productFlow/answerContract.ts` owns the
    defensive async-IIFE unwrap, legacy stdout JSON parsing, `df.answer(...).value`
    fallback, and canonical answer comparison. The runner still owns execution
    and scoring orchestration, but the exact compatibility boundary between
    stdout-era diagnostics and code-mode `df.answer(...)` is directly tested.

21. productFlow agent invocation policy is now isolated from the episode runner.
    `src/eval/productFlow/agentInvocation.ts` owns Claude CLI argument
    construction, process execution, and JSON usage/cost parsing, with focused
    tests for the pure argument/parsing pieces. The runner now reads more like
    the diagnostic harness itself: setup substrate, render/mirror workspace,
    execute episode, score, and record artifacts.

22. Generated workspace memory now names the runtime namespace boundaries
    explicitly. `AGENTS.md` tells agents that `df.db.*` is the mounted
    system/provider data surface, `df.lib.*` is tenant-local TypeScript,
    `df.tool.*` is a governed adapter bridge, and `df.answer(...)` is the typed
    commit boundary. This keeps the code-mode interface discoverable from the
    workspace itself, without adding a registry or prompt catalogue.

23. Generated workspace memory now separates immediate local helper code from
    durable tenant library promotion. Agents are told to put answer-local helper
    code in `scripts/helpers.ts` and import it from `scripts/answer.ts`; they
    are also warned not to create nested `lib/<tenant>/...` paths inside an
    intent workspace, because `lib/` is already the mounted tenant library root.
    Durable `df.lib.*` callability remains the result of validated observer
    promotion plus hook manifests.

24. Default intent-workspace scripts now carry a type-only reference to the
    generated code-mode contract. `scripts/scratch.ts`, `scripts/answer.ts`,
    and `scripts/helpers.ts` begin with
    `/// <reference path="../df.d.ts" />`, so opening a script file directly
    still gives TypeScript/LSP tools a path to the `df.*` declarations. This
    avoids adding a `tsconfig.json` that would incorrectly typecheck snippet
    top-level `return` as normal module code.

25. The generic fallback `datafetch mount` path now carries the same
    code-native discovery and namespace-boundary guidance as the richer
    generated workspace memory. When no source template exists, fallback
    `AGENTS.md` still tells agents to treat the workspace as code, inspect
    `df.d.ts`, use `scripts/helpers.ts` for answer-local helper code, treat
    `lib/` as the mounted tenant library root, and keep durable `df.lib.*`
    callability behind validated observer promotion plus hook manifests.

26. `datafetch apropos`, VFS `apropos`, and `datafetch man` now surface hook
    governance when hook manifests are active. Search results and man pages
    expose maturity, callability, manifest path, replay/success counters, and
    quarantine reason/message when present. This makes hook manifests visible
    in the Unix-style discovery path without making them a new registry or
    bypassing `df.d.ts` as the typed call surface.

27. `datafetch man <name>` can inspect a hook manifest even when the
    TypeScript implementation no longer resolves. A quarantined or otherwise
    non-callable manifest now renders a diagnostic manual page with governance
    and a non-callable invocation comment, instead of returning "no manual
    entry" after `apropos` has already shown the helper. This keeps the
    Unix-style discovery chain coherent while preserving hook manifests as the
    callability authority.

28. The SkillCraft live adapter now distinguishes verified record-backed
    entity fan-out from supporting/category records. The substrate-rooted chain
    gate is enforced only when mounted records actually verify a tool-callable
    entity contract; otherwise pure governed `df.tool.*` composition remains a
    valid cold path. The prompt says the same thing, and runtime preparation can
    root literal scalar entity arrays through `df.db.records` when the values
    truly match mounted records.

29. Learned fan-out helpers now present a code-mode callable shape, not an
    intent-only placeholder. SkillCraft and shared server `df.d.ts` rendering
    expose `entityValues`, `toolBundle`, `toolNames`, `paramName`, and optional
    shared/per-tool input fields for pure fan-out helpers. Observer-authored
    helper templates describe the same typed, parameterised surface. Learned
    live helpers are hidden from callable declarations in `hooks-candidate-only`
    and exposed in callable hook modes such as `hooks-draft`, preserving hook
    manifests as the callability authority.

30. ProductFlow now proves the tenant-library reuse loop through the workspace
    surface. The prompt requires agents to inspect `df.d.ts` and `lib/` before
    writing `scripts/answer.ts`, but still does not leak concrete helper names.
    In the live Claude v3 diagnostic, e2 crystallised
    `lib/productflow-jsonplaceholder/toolFanout.ts`, and e3 called
    `lib.toolFanout` through the tenant library.

31. The first cross-family Claude scorecard proves the intended helper
    trajectory shape, but not the full benchmark gate. The cats/dogs e1-e3
    SkillCraft slice passes correctness/runtime/quarantine/convergence/reuse
    and cross-shape transfer, with one `FANOUT(tool)` helper called across two
    families. The same scorecard keeps the remaining issue explicit: R8
    conditional cost drop misses the gate and cached input tokens exceed the
    framework bound on 4/6 rows. This is the right kind of falsification
    evidence: helper reuse works through code-mode discovery, but the current
    small slice cannot honestly claim full R1-R9 preservation.

32. The first paired FinChain Claude scorecard makes FC3 a measured non-pass
    instead of an unknown. The learned and control balance-sheets slices both
    get FAC `1` on the same three seeds; the paired scorer reports no FAC
    delta, no significance, a small token reduction, and worse wall time, so
    FC3 remains false. This is also useful falsification evidence: the generic
    harness can answer the shape, but the measured learned arm is not yet a
    stronger FinChain arm on that slice.

33. The first cross-benchmark FC4 scorer turns another unknown into measured
    falsification. SkillCraft's helper instrumentation shows called
    `FANOUT(tool)` reuse across cat and dog, while FinChain's artifact walk
    shows three learned-run trajectories with no `df.lib.*` calls. The right
    conclusion is not "cross-benchmark transfer works"; it is that the current
    slice answers the finance shape through the generic code harness but has
    not yet crystallised or selected a reusable tenant helper for that shape.

34. The pure-compute FinChain probe shows why the typed code-mode surface must
    agree with runtime envelopes. With the existing pure-compute gate enabled,
    Claude could crystallise a finance helper and reuse it on the warm seed
    only after the workspace prompt announced validated helpers, examples used
    `(await df.lib.<name>(...)).value`, and `df.d.ts` declared learned helpers
    as `Promise<{ value: number }>` rather than `Promise<number>`. This is a
    reliability improvement because the VFS-visible TypeScript contract,
    runtime Result envelope, and measured trajectory counters now tell the same
    story. It is not an FC completion claim: the learned FinChain signature is
    source-derived and still does not share SkillCraft's `FANOUT(tool)` intent
    signature.

35. The rubric now separates benchmark gates from product-alignment gates.
    FC1-FC5 remain hard FinChain evidence and are not weakened. The
    `codeModeHarness` section in `finchain-scorecard.json` reports the code-mode
    product question directly: safety/non-regression, TypeScript/VFS contract
    evidence, learning-loop crystallisation and reuse, compression under
    saturated correctness, hook/quarantine maturity, and generality. This lets a
    scorecard say "FC3/FC4 still fail" and "the harness learning loop improved"
    at the same time without redefining either claim.

36. The product-alignment diagnostic should not be easy to game. Its status
    vocabulary is now `proven | weak | blocked`, and the current FinChain slice
    is intentionally only `weak` overall. A single prompt-directed helper call
    is not filesystem-discovered reuse, a 5.5% token drop is not proven
    compression, a clean quarantine rate is not helper maturity without
    replay/change/verifier/rollback contracts, and strict FC4 remains false.
    This keeps the diagnostic useful without letting it become a way to route
    around failed benchmark gates.

37. Filesystem-discovered reuse now has an evidence path, but not a free pass.
    `artifact-walk.json` can carry ordered non-prompt agent evidence showing
    inspection of `AGENTS.md`, `df.d.ts`, `lib/`, `datafetch apropos`, or
    `datafetch man` before a `df.lib.*` helper selection. The scorer only marks
    `reuseEvidence.filesystemDiscovered` as `proven` when that ordered evidence
    and an actual trajectory helper call are both present. Re-running the
    current FinChain pure-compute slice still leaves filesystem discovery
    `blocked`: the ignored Claude artifacts show a helper call in final output,
    but no prior ordered inspection trace. That is the right conservative
    result.

38. Helper maturity now separates declared contracts from validated contracts.
    Source-authored helpers can expose ordinary frontmatter fields for
    code-mode discovery and `datafetch man`, but FinChain library maturity only
    counts replay/change/verifier/rollback fields that the quarantine validator
    stamps as `@...` annotations after both origin and held-out replay pass.
    `artifact-walk.json` therefore surfaces declared frontmatter separately and
    sets `contractSource: "validated-header"` only for replay-backed contracts.
    Re-running the current pure-compute slice still leaves
    `helpersWithContracts: 0` because its historical helper predates this
    stamping path. That keeps the rubric non-gameable: frontmatter can describe
    intent, but replay evidence earns maturity.

Together, these slices give agents and vendors a clearer view of a run's
read/compute/tool/write shape and the governed tool surface while keeping the
authoritative state as executable TypeScript source, typed calls, replay
evidence, and normal filesystem artifacts.

## Paper-Principles Recheck Workflow

The paper review adds one recurring workflow check, not a new product layer.
For every future experiment, review the change against these harness
principles before escalating to live evals:

- Executable state: is the new capability expressed as TypeScript source,
  typed calls, hook manifests, or filesystem artifacts rather than an opaque
  side table?
- Code-mode interface: can an agent discover the surface with `ls`, `cat`,
  `rg`, TypeScript/LSP references, `df.d.ts`, `apropos`, and `man`?
- Plan-Execute-Verify: does the change state its hypothesis, run in the
  governed workspace, and produce deterministic sensors such as typecheck,
  tests, acceptance scripts, eval probes, replay, graph, or report artifacts?
- Governed memory: if behavior is learned, is it stored as tenant-local code
  plus replay/change/verifier/rollback evidence, with hook manifests deciding
  callability?
- Telemetry and replay: can a reviewer reconstruct source, typed calls,
  answer, validation, assumptions, observer outcome, and remaining risks from
  the workspace/log artifacts?
- Harness mutation: does the experiment name the failure mode it targets, the
  invariants it preserves, the eval that can falsify it, and the rollback or
  quarantine path?
- Shared-state coordination: if more agents are involved, do they coordinate
  through repo/workspace artifacts and read/write responsibilities rather than
  chat-only state?

This recheck produced no recommendation for a hidden surface index or JSON
trajectory abstraction. The clearer optimization is to keep sharpening the
existing code/filesystem surfaces and then prove progressively larger live
SkillCraft/FinChain/ProductFlow slices with explicit eval evidence.
