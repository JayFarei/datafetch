# Updated Code Harness Goal Prompt

Generated: 2026-05-23T06:45:11Z

This is a copyable continuation goal for a fresh agent. It preserves the
original scope, references the committed progress, and points to
`next-experiments.md` as a fallback menu when the agent runs out of ideas or
hits a local blocker. It does not mark the active goal complete.

```text
Goal: Continue maturing datafetch in the dedicated `code-harness-evals` worktree into a simpler code-centric agent harness, starting from commits `dee158b31` and `fbe25d0dd`, verified by a small reviewable change set plus current evidence in `runs/code-harness-evals/reference.md`, `runs/code-harness-evals/log.md`, `runs/code-harness-evals/architecture-note.md`, `runs/code-harness-evals/completion-audit.md`, `runs/code-harness-evals/quality-review.md`, `eval/finchain/rubric.md`, `bun run typecheck`, relevant focused tests, and the smallest fixed SkillCraft, FinChain, and productFlow probes needed for the claim being made. Preserve the product contract: VFS/filesystem discovery first; `df.d.ts` as the typed code-mode surface; `df.db` as system/provider data; `df.lib` as tenant-learned TypeScript; `df.tool` only as a governed adapter bridge; `df.answer(...)` as the typed answer boundary; and trajectories as externalized cognition made of TypeScript source, typed read/compute/tool/write call graphs, validation, replay evidence, assumptions, source hashes, and observer decisions.

Keep FC1-FC5 and SkillCraft R1-R9 hard: do not weaken scorers, tune benchmark-specific branches, preseed measured helpers, leak helper names through prompts as a metric hack, bypass hook/quarantine, add benchmark-shaped unwrap/default logic, relax `df.answer`, or replace filesystem/code discovery with an opaque registry or dashboard. If the next move is unclear or a local path stalls, select one experiment from `runs/code-harness-evals/next-experiments.md`, state its hypothesis, make the smallest generic substrate change, and prove or falsify it; do not treat those options as shortcuts around the hard gates. Before expensive Codex work or agent fanout, run `lazyusage usage-check codex --json-only` or `bun run dev usage-check codex --json-only` and obey the `codex` service `5h.used_pct` policy: stop at `>=95`, avoid new large work at `>=90`, and treat fallback, stale, or errored readings as unreliable.

Log each attempt to `runs/code-harness-evals/log.md` with hypothesis, diff, evidence observed, exact command exit lines, simplification decision, and next-step rationale. On block, append `BLOCKED:` to that log with attempted paths, evidence gathered, the blocker, and the external state or user input that would unlock progress. Completion requires current evidence that the reviewable code/design is more reliable than the starting point, final eval evidence or an evidence-backed blocker for remaining FC/R gates, and a thermo-nuclear code-quality review showing the implementation stayed simple and maintainable.
```

Audit: Outcome ✓ | Verification ✓ | Constraints ✓ | Boundaries ✓ | Iteration ✓ | Blocked ✓ | 2625 / 4000 chars | log: `runs/code-harness-evals/log.md`
