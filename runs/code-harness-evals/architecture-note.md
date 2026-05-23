# Architecture Note

This branch is not a full benchmark victory claim. It is a small architecture
slice that moves datafetch closer to the intended code-centric harness.

## Why This Is More Reliable

The agent-facing contract is now more truthful and inspectable.

- A trajectory run can be inspected as a derived read/compute/tool/write graph
  using `datafetch graph`, without promoting persisted JSON into a product
  abstraction.
- The same graph is written as `graph.txt` beside workspace `lineage.json`
  artifacts in `tmp/runs/N/`, `result/`, and `result/commits/N/`, so the
  filesystem itself exposes the trajectory shape.
- The governed external tool bridge can be rendered into `df.d.ts`, so `df.db`,
  `df.tool`, `df.lib`, and `df.answer` can all live in the same TypeScript
  code-mode contract when tools are present.
- SkillCraft and productFlow now share the tool declaration renderer instead of
  maintaining separate declaration logic. That reduces drift between eval
  families.
- productFlow now creates `$DATAFETCH_HOME/df.d.ts` before the substrate-on
  prompt asks the agent to read it. The previous prompt could claim that
  `df.d.ts` listed `df.tool.*` even when the generated manifest did not.
- Learned helpers now carry replay/change/verifier/rollback metadata in their
  existing frontmatter, and `datafetch man` renders that metadata as a
  `CONTRACT` section. That makes warm reuse easier to inspect without adding a
  host-owned registry.
- `df.answer(...)` now has a typed optional `assumptions` field, and workspace
  replay records whether assumptions were present. This makes uncertainty part
  of the commit contract instead of hiding it inside prose.
- Workspace replay summaries are now written as `tests/replay.txt` beside
  `tests/replay.json`, so expected output shape, validation state, assumptions,
  and lineage are visible through normal filesystem inspection.
- Accepted `HEAD.json` now points to `source.ts` through `sourceSnapshotPath`
  and exposes the committed `sourceHash`; replay JSON/text mirrors those fields.
  That makes the executed TypeScript source snapshot and identity visible from
  the same filesystem surfaces as graph and replay.
- Workspace artifact writing is isolated in `src/cli/workspaceArtifacts.ts`,
  reducing `src/cli/workspace.ts` from the earlier 916-line shape to a focused
  597-line workspace orchestrator while keeping the VFS artifact contract in
  one focused module.
- Rejected commit attempts no longer overwrite the current accepted `result/`
  view. They remain fully inspectable under `result/commits/N/`, while
  `result/answer.json`, `result/graph.txt`, `result/tests/replay.txt`, and
  `result/HEAD.json` stay aligned to the accepted HEAD.
- Generated workspace memory now explicitly teaches code-native discovery:
  `ls`, `find`, `rg`, `cat`, TypeScript symbols, LSP/IDE references,
  `datafetch apropos`, and `datafetch man` are the discovery model, while
  `df.d.ts` remains the source of truth for call shapes.
- productFlow's workspace-lib diagnostic now uses the workspace as the
  catalogue instead of re-listing tools and primitives in the task prompt. The
  prompt is smaller, and the mirrored workspace carries the typed tool/library
  surface through `df.d.ts` plus `AGENTS.md`.
- `df.d.ts` and generated workspace memory now agree on seed primitives under
  hook modes. Runtime-callable seed fallbacks stay visible, while tenant
  candidates remain governed by hook manifests.
- productFlow scoring can read `df.answer(...).value`, so the diagnostic no
  longer forces a stdout-only answer shape when the product boundary is the
  typed answer envelope.
- Accepted workspaces now include `result/report.md`, and each
  `result/commits/N/` attempt includes its own report. This gives vendors and
  reviewers a single Markdown entrypoint over source hash, answer, validation,
  replay, workspace snapshot, and graph without hiding the underlying files.
- The aggregate report also includes learning eligibility metadata from the
  runtime response: phase, crystallisable flag, mode, and function name. This
  lets reviewers see whether a trajectory is even eligible for observer
  learning/promotion without inferring it from JSON.
- Replay and report artifacts now explicitly state
  `observerDecision: not-recorded-in-workspace-response` and
  `callabilityAuthority: hook-manifest`. This avoids implying that the report
  is itself an observer or promotion registry.
- Generated workspace memory now teaches the post-commit inspection path:
  `result/HEAD.json`, `result/report.md`, `result/source.ts`,
  `result/graph.txt`, and `result/tests/replay.txt`, with `result/` defined as
  the accepted HEAD view.
- Observer decisions now append to
  `observer/<tenant>/decisions.jsonl`, making skipped and crystallised outcomes
  inspectable even when no learned helper file appears.
- Accepted workspace artifacts now point to that append-only observer trail via
  `observerDecisionLogPath` in `HEAD.json` and replay `learning`, plus
  `observerDecisionLog: observer/<tenant>/decisions.jsonl` in readable replay
  and report text.
- productFlow's workspace-lib diagnostic now uses `df.answer(...)` as its
  answer boundary instead of legacy stdout JSON, while keeping the callable
  catalogue in `df.d.ts`, `AGENTS.md`, and `lib/`.
- productFlow prompt rendering and helper-name leak checks now live in
  `src/eval/productFlow/prompt.ts`, so the large runner stays focused on
  setup/execution/scoring and the prompt contract has direct tests.
- Generated workspace memory now distinguishes answer-local helper code from
  durable tenant library promotion. Agents are told to use `scripts/helpers.ts`
  for immediate helper code, not nested `lib/<tenant>/...` paths, while
  durable `df.lib.*` callability remains governed by observer promotion plus
  hook manifests.
- Default mounted workspace scripts now start with
  `/// <reference path="../df.d.ts" />`, giving TypeScript/LSP navigation an
  explicit path from `scripts/scratch.ts`, `scripts/answer.ts`, and
  `scripts/helpers.ts` to the generated `df.*` contract without adding a
  project config that would mis-typecheck snippet top-level `return`.
- Fallback `datafetch mount` workspaces now receive the same code-native
  discovery, namespace-boundary, helper-path, tenant-library-root, and
  promotion-boundary guidance as generated workspace memory. Agents no longer
  get a weaker `AGENTS.md` simply because the catalog source has no template.
- `apropos` and `man` now expose hook governance from the existing hook
  manifests: callability, maturity, manifest path, replay/success counters, and
  quarantine reason/message. Agents can see why a helper is callable,
  fallback-callable, not-callable, or quarantined while staying in the same
  Unix-style discovery flow.
- `man <name>` now has a manifest-only fallback for hooks whose implementation
  cannot be resolved. If `apropos` surfaces a quarantined helper, `man` can
  still show the governance record and diagnostic invocation instead of
  dead-ending with no manual entry.
- The SkillCraft live adapter no longer treats every mounted `df.db.records`
  collection as mandatory entity provenance. It enforces the substrate-rooted
  chain gate only when records verify a tool-callable entity fan-out, allows
  pure governed `df.tool.*` composition for supporting/category records, and
  states that distinction in the Claude-facing prompt.
- Runtime source preparation can now root scalar literal entity arrays through
  mounted records when the values actually match a verified record field. This
  covers the simple `["A", "B"]` shape in addition to prior object/tuple array
  rewrites.
- Learned pure fan-out helpers now expose their real operational TypeScript
  input shape in `df.d.ts` and shared server manifests instead of hiding behind
  intent-only `Object` parameters. This lets agents call crystallised tenant
  helpers from the code contract, while hook manifests still decide whether a
  helper is callable.
- SkillCraft no longer advertises learned live helpers as callable in
  `hooks-candidate-only` mode. That mode can still expose governance evidence,
  but callable learned helper declarations require a callable hook mode such as
  `hooks-draft`.
- ProductFlow's workspace-lib prompt now requires a pre-flight inspection of
  `df.d.ts` and `lib/`. It tells the agent to prefer a matching learned
  library declaration for repeated entity/tool fan-out, while keeping concrete
  helper names out of the task prompt.

## What Stayed Intact

- `df.db` remains the system/provider data surface.
- `df.lib` remains the tenant learned TypeScript surface.
- `df.tool` remains a governed adapter bridge; it is visible only when a tool
  catalog is supplied.
- `df.answer(...)` remains the typed write/commit boundary.
- Trajectory JSON remains persistence, not the product abstraction.
- `graph.txt` remains a derived view over typed calls, not a parallel
  authority.
- Learned helper contracts are frontmatter on tenant TypeScript files; hook
  manifests still decide callability and quarantine.
- Assumptions are optional and replay-visible; existing accepted answers do not
  need to change when no uncertainty remains.
- `tests/replay.txt` is a readable projection of replay evidence, not a second
  replay authority.
- `sourceSnapshotPath` and `sourceHash` are pointers/identity metadata for the
  existing `source.ts` artifact; they do not create another source authority.
- The artifact-module split changes ownership boundaries only; artifact paths,
  accepted HEAD semantics, replay semantics, and evaluator behavior are
  unchanged.
- Rejected attempts stay in append-only history; the easy-to-read `result/`
  directory is the accepted HEAD view, not the last attempted commit.
- Cold `df.db`/`df.tool` composition remains the fallback when no `df.lib`
  helper fits.
- The prompt did not become the catalogue. In the workspace-lib diagnostic,
  concrete helper names appear through the mirrored code workspace
  (`AGENTS.md`, `df.d.ts`, `lib/`), not as hidden task-prompt steering.
- `report.md` is a projection over existing artifacts. It is not a new
  authority, and `HEAD.json` only points to it through `reportPath`.
- Reported learning metadata is runtime response state, not a synthesized
  observer decision. Hook manifests still own final helper callability.
- `observerDecision: not-recorded-in-workspace-response` is an honest absence
  marker, not a final observer verdict.
- Workspace memory points at existing artifacts only; it does not re-list the
  callable catalogue or create a registry.
- The observer decision log is evidence, not callability. Hook manifests still
  own final helper callability.
- `observerDecisionLogPath` is a datafetch-home-relative pointer. It does not
  copy observer outcomes into workspace artifacts or turn the log into a
  promotion source.
- The productFlow workspace-lib prompt still does not inline concrete helper
  names. `per_entity` is visible through the mirrored workspace, not through
  task prompt steering.
- The productFlow extraction is a module boundary only. It does not alter the
  eval runner's substrate setup, scoring, helper availability, or live-agent
  behavior.
- The helper-path clarification is generated `AGENTS.md` guidance only. It does
  not add a registry, make fresh files immediately callable, or change the
  observer/hook promotion path.
- The script reference line is type-only and runtime-neutral. It does not
  change snippet wrapping, answer validation, observer behavior, or evaluator
  scoring.
- The fallback mount guidance is instructional only. It does not introduce a
  registry, alter runtime callability, or make fresh `lib/` files callable
  without observer promotion and hook manifests.
- Hook governance rendering reads existing hook manifests only. It does not
  alter hook decisions, make non-callable hooks callable, or replace `df.d.ts`
  as the typed surface.
- Manifest-only man pages are diagnostic only. They expose hook governance for
  inspection; they do not synthesize schemas, bypass implementation resolution,
  or make quarantined helpers callable.
- Relaxing the SkillCraft chain gate for supporting/category records is not an
  evaluator relaxation. The official evaluator still scores the output, and
  the substrate-rooted gate still applies when records verify a tool-callable
  entity fan-out contract.
- The typed fan-out declaration is a clearer `df.d.ts` contract, not a new
  surface index. Discovery still happens through the mounted filesystem,
  TypeScript declarations, helper source, `apropos`, and `man`.
- ProductFlow learned-helper reuse is still discovered through the workspace,
  not prompt-inlined helper names. The prompt names a repeated fan-out shape,
  not a concrete tenant function.

## Evidence So Far

- `bun run typecheck`: passed.
- Latest `bun run test`: passed with `50` test files and `425` tests after
  removing a generated worktree-local `node_modules/.vite` cache that shadowed
  root dependencies, rerunning with the temporary root dependency symlink, and
  removing that symlink afterward.
- `bash scripts/acceptance/intent-workspace.sh`: passed with `57` assertions,
  including run/commit graph artifacts, `HEAD.graphPath`, replay summary
  artifacts, `HEAD.replaySummaryPath`, `HEAD.sourceSnapshotPath`,
  `HEAD.sourceHash`, `HEAD.reportPath`, replay source hash, replay
  assumption-presence coverage, readable aggregate reports with learning
  eligibility, and accepted-result preservation after a rejected commit.
- `bash scripts/acceptance/intent-workspace.sh`: passed with `60` assertions
  after adding replay/report governance visibility for observer decision status
  and hook-manifest callability authority.
- `bunx vitest run tests/workspace-memory.test.ts`: passed with `3` tests after
  adding the post-commit artifact map to generated `AGENTS.md`.
- `bun run eval:skillcraft:verify`: passed with the existing adapter-readiness
  warning.
- `bun run eval:finchain:verify`: passed with `15/15` checks.
- `bunx vitest run tests/discovery-librarySearch.test.ts tests/observer-author.test.ts`:
  passed with `18` tests, covering `datafetch man` contract rendering and
  authored-helper contract stamps.
- `bunx vitest run tests/snippet-dfBinding.test.ts tests/cli-plan-execute.test.ts tests/discovery-librarySearch.test.ts tests/observer-author.test.ts`:
  passed with `29` tests, covering answer assumptions, replay presence, helper
  contracts, and man-page rendering.
- `bunx vitest run tests/cli-plan-execute.test.ts tests/snippet-dfBinding.test.ts`:
  passed with `11` tests after adding readable replay summaries.
- `bunx vitest run tests/cli-plan-execute.test.ts`: passed with `4` tests
  after adding source snapshot/hash pointers to HEAD and replay artifacts.
- `bunx vitest run tests/cli-plan-execute.test.ts`: passed with `4` tests
  again after extracting workspace artifact writing.
- `bunx vitest run tests/observer-workspace-head.test.ts tests/workspace-memory.test.ts`:
  passed with `8` tests after adding append-only observer decision logging and
  workspace guidance that points to `observer/<tenant>/decisions.jsonl`.
- `bash scripts/acceptance/intent-workspace.sh`: passed with `60` assertions
  after adding observer decision-log discovery guidance.
- `bunx vitest run tests/cli-plan-execute.test.ts`: passed with `4` tests
  after adding the observer decision-log pointer to HEAD, replay, and report
  artifacts.
- `bash scripts/acceptance/intent-workspace.sh`: passed with `62` assertions
  after adding the observer decision-log pointer checks.
- productFlow substrate-on e4 dry-run generated a `df.d.ts` with
  `df.tool.jsonplaceholder` declarations and no concrete `df.lib.<name>` helper
  leak in the prompt/manifest scan.
- productFlow substrate-on e4 workspace-lib dry-run generated a 1275-byte
  prompt, down from 2445 bytes in the previous workspace-lib probe, with no
  rendered tool-bundle/substrate-primitives prompt sections. The mirrored
  workspace `df.d.ts` and `AGENTS.md` both exposed `df.lib.per_entity`.
- productFlow substrate-on e4 workspace-lib dry-run v9 generated a 1519-byte
  prompt that uses `df.answer({ status: "answered", value })`, contains no
  `console.log`, no `prints`, no rendered tool-bundle/substrate-primitives
  sections, no concrete `df.lib.<name>`, and no `per_entity`; `per_entity`
  remains visible in mirrored `df.d.ts` and `AGENTS.md`.
- `bunx vitest run tests/productflow-prompt.test.ts`: passed with `3` tests
  after extracting prompt rendering/leak checks into `prompt.ts`.
- productFlow substrate-on e4 workspace-lib dry-run v10 generated a 1515-byte
  prompt with the same `df.answer(...)` boundary and prompt-leak resistance
  after extraction.
- `bunx vitest run tests/productflow-answerContract.test.ts tests/productflow-prompt.test.ts`:
  passed with `8` tests after extracting productFlow answer-contract helpers
  into `answerContract.ts`.
- productFlow substrate-on e4 workspace-lib dry-run v11 generated the same
  1515-byte prompt with no prompt-level `prints`, `console.log`, rendered
  tool-bundle/substrate-primitives sections, concrete `df.lib.<name>`,
  `per_entity`, or `learnedHelper`; `per_entity` remains visible only in
  mirrored `df.d.ts` and `AGENTS.md`.
- `bunx vitest run tests/productflow-agentInvocation.test.ts tests/productflow-answerContract.test.ts tests/productflow-prompt.test.ts`:
  passed with `12` tests after extracting Claude CLI argument construction and
  usage/cost parsing into `agentInvocation.ts`.
- productFlow substrate-on e4 workspace-lib dry-run v12 generated the same
  1515-byte prompt and preserved the same prompt-leak resistance after agent
  invocation extraction.
- `bunx vitest run tests/workspace-memory.test.ts`: passed with `3` tests after
  adding the generated `Namespace Boundaries` section for `df.db`, `df.lib`,
  `df.tool`, and `df.answer`.
- `bash scripts/acceptance/intent-workspace.sh`: passed with `62` assertions
  after the namespace-boundary guidance change.
- productFlow substrate-on e4 workspace-lib dry-run v13 generated the same
  1515-byte prompt, kept helper names out of the prompt, and mirrored the
  namespace-boundary guidance into workspace `AGENTS.md`; `per_entity` remains
  visible only in mirrored `df.d.ts` and `AGENTS.md`.
- productFlow substrate-on e4 workspace-lib dry-run v14 generated the same
  1515-byte prompt, kept helper names out of the task prompt, and mirrored the
  `scripts/helpers.ts` versus tenant `lib/` promotion guidance into workspace
  `AGENTS.md`; `per_entity` remains visible only in mirrored `df.d.ts` and
  `AGENTS.md`.
- `bunx vitest run tests/workspace-memory.test.ts`: passed with `3` tests after
  clarifying answer-local helper paths versus validated observer promotion.
- `bash scripts/acceptance/intent-workspace.sh`: passed with `62` assertions
  after the helper-path guidance change.
- `bun run test`: passed with the then-current full suite (`50` files,
  `415` tests) after the helper-path guidance change; the temporary root
  dependency symlink was removed afterward and `node_modules-clean` was
  confirmed.
- `bash scripts/acceptance/intent-workspace.sh`: passed with `66` assertions
  after adding type-only `df.d.ts` references to default workspace scripts.
- productFlow substrate-on e4 workspace-lib dry-run v15 generated the same
  1515-byte prompt and preserved helper-name prompt-leak resistance after the
  script-reference change.
- `bun run test`: passed with the then-current full suite (`50` files,
  `415` tests) after the script-reference change; the temporary root
  dependency symlink was removed afterward and `node_modules-clean` was
  confirmed.
- `bunx vitest run tests/workspace-memory.test.ts tests/server-v1connect.test.ts tests/hooks/manifest-rendering.test.ts`:
  passed with `18` tests, covering code-native workspace memory, correct flat
  `df.answer(...)` snippet examples, and seed primitive visibility in
  `df.d.ts` under hook modes.
- `bunx vitest run tests/cli-plan-execute.test.ts`: passed with `5` tests
  after adding the fallback mount `AGENTS.md` regression.
- `bash scripts/acceptance/intent-workspace.sh`: passed with `66` assertions
  after the fallback mount guidance change.
- productFlow substrate-on e4 workspace-lib dry-run v16 generated the same
  1515-byte prompt; helper names remain absent from the task prompt, while
  `per_entity` is visible only through the mirrored workspace `AGENTS.md` and
  `df.d.ts`.
- `bun run test`: passed with the then-current full suite (`50` files,
  `416` tests) after the fallback mount guidance change; the temporary root
  dependency symlink was removed afterward and `node_modules-clean` was
  confirmed.
- `bunx vitest run tests/discovery-librarySearch.test.ts tests/hooks/manifest-rendering.test.ts`:
  passed with `11` tests after adding hook governance to `apropos` and `man`,
  including not-callable invocation marking and manifest-only `man` fallback
  for a quarantined hook whose implementation no longer resolves.
- `bunx tsx src/bash/__smoke__.ts`: passed with `7/7`, covering VFS `man` and
  `apropos` after the shared renderer change.
- `bunx vitest run tests/runtime-toolCatalog.test.ts tests/server-v1connect.test.ts tests/workspace-memory.test.ts tests/hooks/manifest-rendering.test.ts tests/discovery-librarySearch.test.ts`:
  passed with `30` tests after the hook-governance discovery change.
- `bash scripts/acceptance/intent-workspace.sh`: passed with `66` assertions
  after the hook-governance discovery change.
- productFlow substrate-on e4 workspace-lib dry-run v19 generated the same
  1515-byte prompt; helper names remain absent from the task prompt, while
  `per_entity` is visible only through the mirrored workspace `AGENTS.md` and
  `df.d.ts`.
- `bun run test`: passed with `50` test files and `419` tests after the
  hook-governance discovery change; the temporary root dependency symlink was
  removed afterward and `node_modules-clean` was confirmed.
- `bunx vitest run tests/cli-plan-execute.test.ts`: passed with `4` tests
  after adding `report.md` and `HEAD.reportPath`.
- `bunx vitest run tests/cli-plan-execute.test.ts`: passed with `4` tests
  again after adding the report `Learning` section.
- `DATAFETCH_AGENT=claude CLAUDE_CLI=claude-p ... bun run eval:skillcraft -- --live --limit 1 --out-dir runs/code-harness-evals/probes/skillcraft-claude-live-limit1-v5`:
  passed one live SkillCraft episode (`cat-facts-collector/e1`) with
  `officialPassed: true`, `officialStatus: pass`, `answerStatus: answered`,
  `snippetExitCode: 0`, and score `95/100`.
- `DATAFETCH_AGENT=claude CLAUDE_CLI=claude-p ... bun run eval:finchain -- --live --limit 1 --out-dir runs/code-harness-evals/probes/finchain-claude-live-limit1-v2`:
  passed one live FinChain episode with `fac=true`, predicted `3102`, gold
  `3102`, `snippetExitCode: 0`, and score percent `100`.
- `bunx vitest run tests/skillcraft-full-datafetch-planner.test.ts tests/snippet-runtime-phase.test.ts`:
  passed with `65` tests after tightening the record-backed gate and scalar
  literal rewrite.
- `bun run test`: passed with `50` test files and `421` tests after the Claude
  live-probe gate fix; the temporary root dependency symlink was removed
  afterward and `node_modules-clean` was confirmed.
- `bunx vitest run tests/skillcraft-full-datafetch-planner.test.ts tests/observer-author.test.ts tests/hooks/df-lib-proxy.test.ts tests/hooks/hook-registry.test.ts`:
  passed with `92` tests after rendering learned fan-out helpers with their
  operational input shape and filtering learned callable declarations by hook
  interface mode.
- `bunx vitest run tests/hooks/manifest-rendering.test.ts tests/skillcraft-full-datafetch-planner.test.ts tests/observer-author.test.ts tests/workspace-memory.test.ts`:
  passed with `83` tests after applying the same learned fan-out shape to the
  shared server manifest.
- `DATAFETCH_INTERFACE_MODE=hooks-draft DATAFETCH_AGENT=claude CLAUDE_CLI=claude-p ... bun run eval:skillcraft -- --live --families cat-facts-collector --levels e1,e2,e3 --out-dir runs/code-harness-evals/probes/skillcraft-claude-family-catfacts-e1e2e3-v3-hooks-draft`:
  passed e1/e2/e3 with `officialStatus: pass`, `snippetExitCode: 0`, and
  score `95/100` each. The e3 warm episode had `libFunctionsAvailable: 1` and
  `libFunctionsUsed: 1`, proving learned-helper reuse in hooks-draft mode.
- `DATAFETCH_INTERFACE_MODE=hooks-draft DATAFETCH_AGENT=claude CLAUDE_CLI=claude-p ... bun run eval:skillcraft -- --live --families cat-facts-collector,dog-breeds-encyclopedia --levels e1,e2,e3 --out-dir runs/code-harness-evals/probes/skillcraft-claude-crossfamily-cats-dogs-e1e2e3-v1-hooks-draft`:
  passed all six episodes. Read-only normalization, artifact walking, intent
  clustering, and `score-r1-r9.ts` then produced
  `r1-r9-scorecard.json`: R1, R2, R3, R4, R6, R7, and R9 pass, with
  `FANOUT(tool)` reused across cat and dog families. The same scorecard keeps
  completion honest: R8 is `0.7226` against `<=0.70`, per-pair pass fraction
  is `0.5`, and `cacheBoundedByFramework` fails because 4/6 rows exceed
  `250000` cached input tokens.
- `DATAFETCH_INTERFACE_MODE=hooks-draft DATAFETCH_AGENT=claude CLAUDE_CLI=claude-p ... bun run eval:finchain -- --live --topics accounting_and_financial_reporting/balance_sheets --templates 1 --seed-indices 0,1,2 --out-dir runs/code-harness-evals/probes/finchain-claude-balance-sheets-tpl1-seeds0-2-v1-hooks-draft`:
  passed three FinChain seeds with `facMatch: true`, predicted values `3102`,
  `5383`, and `16447` matching gold, `snippetExitCode: 0`, and score percent
  `100`.
- FinChain normalization, analysis, and `score-finchain.ts` now write
  `normalized.jsonl`, `analysis.json`, `r1-r9-scorecard.json`,
  `finchain-scorecard.json`, and `finchain-scorecard-with-skillcraft.json`
  for the three-seed slice. The FC scorecard shows Basic FAC `1` and step
  alignment `0.75`, but FC1/FC2 remain conditional without paper baselines
  and FC5 is false because the attached SkillCraft scorecard is not fully
  passing.
- `DATAFETCH_DISABLE_LEARNING=1 DATAFETCH_INTERFACE_MODE=hooks-draft DATAFETCH_AGENT=claude CLAUDE_CLI=claude-p ... bun run eval:finchain -- --live --topics accounting_and_financial_reporting/balance_sheets --templates 1 --seed-indices 0,1,2 --out-dir runs/code-harness-evals/probes/finchain-claude-balance-sheets-tpl1-seeds0-2-control-v1-hooks-draft`:
  passed the matching three-seed control arm with `fac=true` for all seeds.
  A paired normalized bundle at
  `runs/code-harness-evals/probes/finchain-claude-balance-sheets-tpl1-seeds0-2-paired-v1-hooks-draft`
  now makes FC3 measured rather than missing: `pairedCount: 3`,
  `facLearnedMean: 1`, `facControlMean: 1`, `facDeltaMean: 0`,
  `facPValue: 1`, `tokenReductionPct: 0.10063598952487837`,
  `wallClockReductionPct: -0.1544697806533059`, and `passes: false`.
- The same paired FinChain bundle now measures FC4 from read-only artifact
  walks instead of leaving it conditional. SkillCraft called `FANOUT(tool)`
  across cat/dog episodes, but the FinChain learned slice made no `df.lib.*`
  calls, so the scorecard has no shared intent signatures and FC4
  `passes: false`.
- The pure-compute FinChain probe then exposed a real code-mode contract issue:
  validated learned helpers were not announced after crystallisation, and
  FinChain `df.d.ts` declared `df.lib.*` helper calls as returning
  `Promise<number>` even though runtime calls return a Result envelope. The
  runner now announces all validated helpers, examples unwrap with `.value`,
  and `df.d.ts` declares `Promise<{ value: number }>` for learned helpers.
  `runs/code-harness-evals/probes/finchain-claude-balance-sheets-tpl1-seeds0-2-purecompute-v4-hooks-draft`
  proves the fix under Claude: seed 1 crystallised
  `constAnswerDfAnswerBindDf`, seed 2 called
  `lib.constAnswerDfAnswerBindDf`, all three FAC checks passed, and artifact
  walking reports R6/R7 pass for that learned finance shape.
- The latest pure-compute paired FC scorecard is still honest about remaining
  gates. FC3 remains false with `facDeltaMean: 0`, `facPValue: 1`,
  `tokenReductionPct: 0.0553684998129443`, and
  `wallClockReductionPct: 0.018739151017831853`; FC4 remains false because the
  FinChain called signature is source-derived while SkillCraft's called
  signature is `FANOUT(tool)`.
- The same scorecard now carries an additive `codeModeHarness` diagnostic so
  product-alignment evidence is visible without weakening FC gates. After the
  anti-gaming hardening pass, the pure-compute paired bundle has
  `overallStatus: weak`: benchmark safety is `proven`, while learning-loop
  reuse, reuse evidence, compression, library maturity, code-mode contract, and
  generality are `weak`. The scorecard now explicitly separates prompt-directed
  helper calls from filesystem-discovered and held-out discovered reuse.
- `bunx vitest run tests/productflow-prompt.test.ts tests/hooks/manifest-rendering.test.ts`:
  passed with `11` tests after tightening the ProductFlow workspace-lib
  pre-flight catalogue instruction.
- `DATAFETCH_INTERFACE_MODE=hooks-draft CLAUDE_CLI=claude-p bunx tsx src/eval/productFlow/runProductFlowMicroEval.ts --arm substrate-on --workspace-lib --out-dir runs/code-harness-evals/probes/productflow-substrate-on-workspace-lib-live-v3-hooks-draft`:
  passed all four ProductFlow episodes with `answerCorrect: true`; e2
  crystallised `lib/productflow-jsonplaceholder/toolFanout.ts`, and e3 called
  `lib.toolFanout` through the tenant library.
- Latest `bun run typecheck`, `bun run eval:skillcraft:verify`, and
  `bun run eval:finchain:verify`: passed. SkillCraft verify still reports the
  existing adapter-readiness warning.
- Latest full `bun run test`: passed with `52` test files and `428` tests.

## Remaining Proof Gap

The branch still needs broader live eval evidence before the active goal can be
called complete. In particular, SkillCraft full adapter readiness remains a
pre-existing warning, and the current live evidence is limited to small
Claude-backed fixed slices. The strongest SkillCraft slice proves cross-shape
reuse but still fails R8/cache qualification. The newest FinChain slice proves
finance-shaped helper crystallisation and warm reuse under the typed code-mode
contract, but the paired scorecard still measures FC3 and FC4 as false while
FC1/FC2/FC5 remain conditional or false. Full R1-R9 and FC1-FC5 representative
coverage has not been run.

`completion-audit.md` records this requirement-by-requirement rather than
treating the local architecture slice as full completion proof.
