# Code Harness Architecture Goal

Generated: 2026-05-21

Reference: `runs/code-harness-evals/reference.md`
Run log: `runs/code-harness-evals/log.md`

```text
Goal: Mature datafetch in the dedicated `code-harness-evals` worktree into a simpler, code-centric agent harness inspired by Cloudflare Code Mode and the Code as Agent Harness paper, verified by a repo-grounded change set plus concrete evidence from `bun run typecheck`, `bun run test`, `bun run eval:skillcraft:verify`, `bun run eval:finchain:verify`, targeted SkillCraft/FinChain/productFlow probes, and a thermo-nuclear code-quality review. The architecture should preserve the core product shape: VFS/filesystem-first progressive discovery through normal Unix commands, `df.d.ts`, `datafetch apropos`, and `datafetch man`; `df.db` as the system/provider data surface; `df.lib` as the tenant-level learned TypeScript library; governed `df.tool` as an adapter bridge; and `df.answer(...)` as the typed write/commit/eval boundary. Treat trajectory as externalized cognition made of TypeScript source plus typed read/compute/tool/write calls, validation, replay evidence, assumptions, source hashes, and observer decisions; JSON may remain persistence, but it must not become the product abstraction or a hidden host-owned registry.

Use only generic substrate changes that make the system easier to inspect, replay, verify, and learn from. Do not weaken scorers, tune benchmark-specific branches, preseed measured helpers, leak helper names through prompts as a metric hack, bypass hook registry/quarantine, add benchmark-shaped unwrap/default logic, relax `df.answer`, or replace filesystem/code discovery with opaque registries. Work eval-first: each iteration states one hypothesis, makes the smallest generic change, runs the narrowest useful probe, records the evidence, and only then escalates to broader evals. When the Codex lazyusage 5h reading is reliable and below 90 percent, use a team topology over shared program state: architect owns the plan and integration, explorers map code/eval surfaces, implementers own disjoint files, verifiers run probes, and reviewer applies the strict quality bar; when the reading is fallback, stale, errored, missing, or at/above threshold, avoid agent fan-out and continue locally or stop according to the policy.

Log each attempt to `runs/code-harness-evals/log.md` with the hypothesis or claim attacked, the diff made, evidence observed, and next-step rationale. On block, append a `BLOCKED:` entry to that log with attempted paths, evidence gathered, the exact blocker, and the user input or external state change that would unlock progress.
```

Audit: Outcome ✓ | Verification ✓ | Constraints ✓ | Boundaries ✓ | Iteration ✓ | Blocked ✓
