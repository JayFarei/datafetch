# Completion Audit

Reviewed: 2026-05-22

This audit treats the active goal as unproven until each requirement has
authoritative evidence. It is not a completion claim.

## Current Verdict

Not complete.

The branch has a coherent local architecture slice, passing local tests,
documented evidence, and small live Claude-backed probes across the three eval
shapes. The remaining gap is full representative eval proof: SkillCraft full
adapter readiness is still explicitly false, and the small fixed slices do not
prove all SkillCraft R1-R9 or FinChain R1-R9/FC1-FC5 criteria.

## Requirement Status

| Requirement | Status | Current Evidence |
| --- | --- | --- |
| Work in a dedicated worktree | Proven | `pwd` and `git rev-parse --show-toplevel` both resolve to `.claude/worktrees/code-harness-evals`; branch is `worktree-code-harness-evals`. |
| Keep `runs/code-harness-evals/reference.md` and `log.md` | Proven | Both files exist and record the paper/Code Mode principles, implemented slices, attempt log, evidence, and blocker. |
| Preserve filesystem/VFS discovery first | Proven locally | Generated workspace memory and fallback mount `AGENTS.md` now teach `ls`, `find`, `rg`, `cat`, TypeScript/LSP-style navigation, `datafetch apropos`, `datafetch man`, explicit namespace boundaries, answer-local `scripts/helpers.ts` usage, the mounted tenant `lib/` root, validated observer promotion, hook-manifest callability, and post-commit inspection of `result/HEAD.json`, `result/report.md`, source, graph, and replay artifacts. Default workspace scripts also carry `/// <reference path="../df.d.ts" />` so opened script files point LSP/IDE tooling at the typed `df.*` surface. ProductFlow workspace-lib dry-run points at `AGENTS.md`, `df.d.ts`, and `lib/` instead of prompt-inlining the catalogue. |
| Keep `df.d.ts` as the typed code-mode contract | Proven locally | `src/server/manifest.ts`, `src/runtime/toolCatalog.ts`, SkillCraft live `df.d.ts`, and productFlow generated workspaces now share typed declaration rendering for `df.db`, `df.tool`, `df.lib`, and `df.answer` where applicable. |
| Keep `df.db` system/provider level and `df.lib` tenant level | Proven locally | The change set preserves the existing runtime namespace split; workspace memory and reference docs name `df.db` as the mounted system/provider data surface and `df.lib` as tenant-local learned TypeScript. |
| Keep `df.tool` governed and explicit | Proven locally | `df.tool` is rendered only from a supplied tool catalog; `tool_manifest.json` remains a fallback, not the primary discovery surface. |
| Keep `df.answer(...)` as typed answer/commit boundary | Proven locally | `AnswerInput` now includes optional `assumptions`; workspace commit/replay/report artifacts are generated from the typed answer envelope. |
| Treat trajectory as externalized cognition, not JSON product model | Proven locally | The branch adds a derived read/compute/tool/write graph over typed calls, `graph.txt`, `source.ts`, `sourceHash`, replay JSON/text, report pointers, learning eligibility, an explicit `observerDecision: not-recorded-in-workspace-response` marker, an `observerDecisionLogPath`, and append-only observer decision records while keeping trajectory JSON as persistence. |
| Preserve hook registry/quarantine as callability boundary | Proven locally | Learned helper trust metadata is frontmatter/man-page evidence; final callable state remains owned by hook manifests. Generated workspace memory now warns that a fresh file is not immediately callable as `df.lib.*`; durable callability comes from validated observer promotion plus hook manifests. `apropos` and `man` now expose hook manifest governance fields without changing callability, and `man` can inspect a manifest-only quarantined helper when the implementation cannot resolve. |
| Vendor/reviewer visibility | Proven locally | Accepted `result/` and per-attempt `result/commits/N/` include `report.md` with source hash, validation, answer, learning eligibility, observer decision status, observer decision-log pointer, callability authority, artifact pointers, replay, and graph. Observer outcomes are also appended under `observer/<tenant>/decisions.jsonl`. |
| Observer/promotion decisions | Proven locally | Observer decisions append to `observer/<tenant>/decisions.jsonl`; `HEAD.json`, replay, report, and workspace guidance point agents at that path; hook manifests remain the final callability authority. |
| ProductFlow architecture diagnostic | Proven for live diagnostic scope | Dry-run probes show the workspace-lib prompt no longer renders the catalogue in prompt text, uses `df.answer({ status: "answered", value })` as the answer boundary, and leaves helper names discoverable through mirrored `df.d.ts`/`AGENTS.md`/`lib/`. `tests/productflow-prompt.test.ts` locks in prompt-leak resistance and the workspace-lib answer boundary; `tests/productflow-answerContract.test.ts` locks in stdout/envelope answer compatibility and canonical comparison; `tests/productflow-agentInvocation.test.ts` locks in Claude CLI argument and usage parsing policy. The live Claude run `runs/code-harness-evals/probes/productflow-substrate-on-workspace-lib-live-v3-hooks-draft/results.json` has all four episodes `answerCorrect: true`; e2 crystallises `lib/productflow-jsonplaceholder/toolFanout.ts`, and e3 calls `lib.toolFanout` from the tenant library. |
| SkillCraft R1-R9 preservation/improvement | Stronger but still incomplete | `bun run eval:skillcraft:verify` exits 0, but still warns that the full Datafetch adapter is not marked ready for representative Datafetch-vs-SkillCraft results. The two-family Claude-backed slice `runs/code-harness-evals/probes/skillcraft-claude-crossfamily-cats-dogs-e1e2e3-v1-hooks-draft` passed all 6 episodes with `officialStatus: pass` and `snippetExitCode: 0`; its read-only R1-R9 scorecard passes R1, R2, R3, R4, R6, R7, and R9, including `FANOUT(tool)` cross-shape transfer across cat and dog. It still fails full qualification: R8 conditional cost drop is `0.7226` against `<=0.70`, per-pair pass fraction is `0.5`, and `cacheBoundedByFramework` fails with 4/6 rows over `250000` cached input tokens. |
| FinChain R1-R9 and FC1-FC5 | Partially proven with paired FC scorecard | `bun run eval:finchain:verify` exits 0 with `15/15` mount checks. The Claude-backed learned three-seed slice `runs/code-harness-evals/probes/finchain-claude-balance-sheets-tpl1-seeds0-2-v1-hooks-draft/episodes.jsonl` and the pure-compute gated slice `runs/code-harness-evals/probes/finchain-claude-balance-sheets-tpl1-seeds0-2-purecompute-v4-hooks-draft/episodes.jsonl` both passed seed 0, 1, and 2 with values `3102`, `5383`, and `16447` matching gold. The pure-compute slice crystallised `constAnswerDfAnswerBindDf` on seed 1; seed 2 then called `lib.constAnswerDfAnswerBindDf`, and the artifact walk reports R6 convergence `1.000`, R7 conditional reuse `1.000`, and R4 quarantine pass. The matching control arm `runs/code-harness-evals/probes/finchain-claude-balance-sheets-tpl1-seeds0-2-control-v1-hooks-draft` also passed all three seeds. The latest pure-compute paired scorecard under `runs/code-harness-evals/probes/finchain-claude-balance-sheets-tpl1-seeds0-2-purecompute-paired-v1-hooks-draft/finchain-scorecard-with-skillcraft.json` keeps FC3 false: `pairedCount: 3`, `facDeltaMean: 0`, `facPValue: 1`, `tokenReductionPct: 0.0553684998129443`, `wallClockReductionPct: 0.018739151017831853`, `passes: false`. FC4 is also false, but for a stronger reason than Attempt 39: FinChain now has a called source-derived signature `source(741e898f44eb9d42)`, SkillCraft called `FANOUT(tool)`, and `sharedIntentSignatures: []`. The additive `codeModeHarness` diagnostic now uses `proven | weak | blocked`: overall status is `weak`; only benchmark safety is `proven`. Learning loop, reuse evidence, compression, library maturity, code-mode contract, and generality are `weak` because the evidence is one prompt-directed warm reuse, below the 10% compression threshold, lacks validator-stamped `validated-header` helper contracts, or lacks filesystem-discovered/held-out/general transfer proof. The historical pure-compute helper remains `helpersWithContracts: 0` on its stale probe. Attempt 47 then ran the fresh live slice this audit had asked for: `runs/code-harness-evals/probes/finchain-claude-maturity-contract-v1-hooks-draft` passed all three seeds (`3102`, `5383`, `16447`), crystallised `constAnswerDfAnswerBindDf`, and the quarantine validator promoted it and stamped evidence-carrying header annotations (`@replay-contract: origin=traj_20260523070833_bjrevn exp=5383 got=5383; heldout=traj_20260523070818_3pevti exp=3102 got=3102`, `@verifier: quarantineValidator idempotency+genericity replay pass`, `@change-contract`, `@rollback`). The artifact walk reports `contractSource: "validated-header"` with R4 pass, and `score-finchain.ts` reports `codeModeHarness.libraryMaturity: "proven"` with `helpersWithContracts: 1/1` and `requiredContractSource: "validated-header"`. On that single learned arm the other layers stay honest: `benchmarkSafety`/`compression` `blocked` (`pairedCount: 0`), `learningLoop`/`reuseEvidence` `weak` (one warm opportunity vs threshold three), `generality` `blocked`, `overall: "blocked"`. This proves the committed promotion-time contract path end-to-end on live artifacts without weakening any FC/R gate. Attempt 48 then ran a larger six-seed learned-only slice `runs/code-harness-evals/probes/finchain-claude-learningloop-seeds0-5-v1-hooks-draft` (all six `fac=true`); the artifact walk reports R6 `pass=true` and R7 `conditionalReuse=1.000 (4/4)`, and the scorecard moves `codeModeHarness.learningLoop` to `proven` (four warm `df.lib.*` reuse trajectories) while `libraryMaturity` stays `proven`. On these learned-only arms `benchmarkSafety`/`compression` remain `blocked` (no control arm), `reuseEvidence.filesystemDiscovered` remains `blocked` (no ordered agent-event trace), and `generality` remains `blocked` (FC4 signature mismatch). Attempt 49 then closed the filesystem-discovery gap: the runner now invokes `claude-p` with `--output-format stream-json` and persists an ordered `events.jsonl` per episode, and the walker derives discovery evidence from those ordered streams only (commit `54342f0b7`, with pure-parser test `tests/agent-stdout-parse.test.ts`). The fresh 3-seed slice `runs/code-harness-evals/probes/finchain-claude-discovery-trace-seeds0-2-v1-hooks-draft` (all `fac=true`) shows `discoveryEvidence.status: "proven"`, `inspectedSurfaces: ["AGENTS.md","df.d.ts"]`, `inspectedBeforeHelper: true` (inspect at indices 6/10/31 precede the helper call at 57), so `reuseEvidence.filesystemDiscovered` is `proven`. The consolidating six-seed slice `runs/code-harness-evals/probes/finchain-claude-discovery-warmreuse-seeds0-5-v1-hooks-draft` (all `fac=true`, R6 pass, R7 `4/4`) reports `learningLoop: proven`, `libraryMaturity: proven (1/1)`, and `reuseEvidence: proven` with `filesystemDiscovered: proven`; `benchmarkSafety`/`compression` stay `blocked` (no control arm) and `generality` `blocked` (FC4), so `overall: "blocked"`. Across all current evidence the `codeModeHarness` diagnostic now has five proven layers (`benchmarkSafety` on the earlier paired probe, plus `learningLoop`, `libraryMaturity`, `reuseEvidence`, `filesystemDiscovered`); the remaining non-proven layers are documented structural blockers: `compression` (correctness saturation, FC3) and `generality` (FC4 signature mismatch). FC1/FC2 remain conditional without paper baselines, and FC5 is false because the attached SkillCraft scorecard is not fully passing. |
| Small fixed SkillCraft+FinChain probes before broad bilateral run | Proven for Claude small-slice scope | `runs/code-harness-evals/probes/skillcraft-claude-crossfamily-cats-dogs-e1e2e3-v1-hooks-draft`, `runs/code-harness-evals/probes/finchain-claude-balance-sheets-tpl1-seeds0-2-v1-hooks-draft`, `runs/code-harness-evals/probes/finchain-claude-balance-sheets-tpl1-seeds0-2-purecompute-v4-hooks-draft`, and the paired FinChain control/comparison directories contain small live Claude-backed slices plus normalized/scorecard artifacts. ProductFlow live v3 also proves workspace-lib tenant helper reuse. |
| Typecheck/tests | Proven | Logged evidence records passing `bun run typecheck`, focused vitest, acceptance script, productFlow dry-run/live probes, Claude live probes, both eval verifiers, and full `bun run test` with `55` test files and `433` tests. The latest acceptance pass has `intent-workspace acceptance: 66 passed, 0 failed`. |
| Thermo-nuclear code quality review | Proven locally | `runs/code-harness-evals/quality-review.md` records the maintainability audit, fixed issues, file-size review, residual risks, and approval rationale for the local slice. |
| Codex usage guard before expensive Codex work/fan-out | Blocked for Codex, bypassed for explicit Claude probes | `lazyusage usage-check codex --json-only` exits 127 (`command not found`), and `bun run dev usage-check codex --json-only` exits 1 (`Script not found "dev"`). The latest live probes used `DATAFETCH_AGENT=claude` and did not start Codex fan-out. |

## Remaining Completion Gap

Attempts 47-49 closed the code-mode harness product-alignment gaps that were
locally addressable: `libraryMaturity`, `learningLoop`, `reuseEvidence`, and
`reuseEvidence.filesystemDiscovered` are now `proven` on fresh live slices,
joining `benchmarkSafety` (paired probe). That is five of seven diagnostic
layers proven with honest evidence and no scorer relaxation.

The remaining gap is the hard benchmark gates, which are blocked for structural
reasons rather than missing local work:

- FC3 / `compression`: correctness saturates both arms on this FinChain
  pure-compute corpus (`facPValue: 1`, token reduction ~5.5% < 10%). This is a
  benchmark-difficulty ceiling, not a scorer issue, and Attempt 50 confirmed it
  is model-independent: re-running the consolidating 6-seed slice with Opus 4.7
  (`finchain-opus47-discovery-warmreuse-seeds0-5-v1-hooks-draft`) kept all six
  seeds `fac=true` with the identical code-mode harness layer outcomes, so a
  stronger model reinforces saturation rather than breaking it. Attempt 51 then
  showed harder FinChain templates do not unblock it either: the hardest
  balance_sheets template (position 5, multi-step `business_combination`,
  `finchain-sonnet-balance-sheets-HARD-tpl5-seeds0-5-v1-hooks-draft`) still got
  6/6 `fac=true`, and although a helper crystallised and was reused (R7 4/4) and
  genuinely encapsulated the multi-step goodwill formula, the warm agent
  re-derived the computation by hand to fill the `df.answer` derivation, so
  tokens rose rather than fell. The compounding structural blockers are
  saturated correctness, literal task inputs (no retrieval/IO for a helper to
  offload), and a derivation expectation that induces manual recomputation.
  Realising headroom needs a corpus where the cold path must do expensive
  retrieval or multi-turn tool work, i.e. CRAG + tau-3-bench.
- FC4 / `generality`: SkillCraft `FANOUT(tool)` and FinChain `source(...)` are
  genuinely different intent signatures, so strict same-signature transfer is
  correctly false.
- SkillCraft R8/cache and full bilateral R1-R9 proof remain open.

Per `project_next_benchmark`, escaping FC3 correctness saturation requires a
harder successor corpus (CRAG + tau-3-bench), which is a separate large effort.
The remaining honest options are that successor-corpus work or shipping the
current architecture slice with these structural eval limitations recorded.

Codex-backed large work or agent fan-out is still blocked until one of these
guard commands becomes reliable:

```sh
lazyusage usage-check codex --json-only
bun run dev usage-check codex --json-only
```

For Claude-backed eval work, the next safe escalation is a larger but still
bounded multi-family/control run only if it is meant to answer the remaining
R8/FC3 question; broad bilateral completion remains unproven.
