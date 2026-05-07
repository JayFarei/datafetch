---
title: "feat: Mirage runtime parity spike"
summary: "Evaluate Mirage as the VFS substrate by reaching parity with the current just-bash intent workspace and adding full committed-worktree snapshots."
type: feat
status: evaluated
date: 2026-05-07
related_research:
  - kb/br/13-strukto-mirage-vfs.md
  - kb/plans/006-vfs-native-discovery-and-reuse.md
---

# Mirage Runtime Parity Spike

## Overview

This spike creates an isolated implementation track for replacing the current just-bash substrate with a Mirage-backed workspace, without changing the Datafetch product contract. The branch must preserve the current `datafetch mount -> run -> commit -> observer -> reuse` behavior while adding a full workspace snapshot at commit time.

The purpose is not to rewrite Datafetch around Mirage. The purpose is to test whether Mirage makes the VFS/worktree model cleaner than the current hybrid of disk intent workspaces plus just-bash runtime sessions.

## Implementation Result (2026-05-07)

The first implementation slice reached opt-in `/v1/bash` parity rather than a full product migration.

What shipped in the spike branch:

- `@struktoai/mirage-node` is available behind `DATAFETCH_BASH_RUNTIME=mirage`.
- `createBashApp(...)` can construct either the existing `BashSession` or the new `MirageSession`.
- `datafetch agent` can also opt into Mirage with `--runtime mirage` or `DATAFETCH_BASH_RUNTIME=mirage`.
- `MirageSession` mounts a writable root, writable `/lib`, and read-only `/db/<mount>` resources.
- The existing `npx tsx`, `pnpm exec tsx`, `yarn tsx`, `apropos`, and `man` affordances are preserved.
- The bash smoke harness and `/v1/bash` tests now run against both runtimes.

What the tests showed:

- Default just-bash path still passes the full suite: `pnpm test` reports 191 passing Vitest tests plus smoke harnesses.
- Mirage-selected path also passes the full suite: `DATAFETCH_BASH_RUNTIME=mirage pnpm test` reports the same 191 passing Vitest tests plus smoke harnesses.
- Default acceptance still passes: `session-switch` 14 assertions and `intent-workspace` 38 assertions.
- Mirage-selected acceptance also passes the same `session-switch` and `intent-workspace` assertions.
- A real Mirage compatibility gap surfaced: `ls /db /lib` initially failed because Mirage rejects cross-mount `ls` calls. The spike added a small multi-path `ls` compatibility shim because that command shape is natural for agents.

Decision:

- Keep just-bash as the default MVP substrate for now.
- Keep Mirage as an opt-in runtime spike because it cleanly expresses per-resource mount modes and gives us a credible path toward FUSE, richer command routing, and server-managed VFS snapshots.
- Do not claim real Git/worktree semantics yet. The current version-control value comes from Datafetch commit snapshots, not from Mirage itself.

## Problem Frame

The current runtime proves the learning loop, but its filesystem model is split:

- the client-facing intent workspace is a real disk folder;
- server bash sessions use just-bash's in-memory `MountableFs`;
- tenant `lib/` is shared mutable state during a workspace, not an isolated worktree;
- `datafetch commit` captures `scripts/answer.ts`, answer artifacts, lineage, and replay metadata, but not the full workspace source closure.

Mirage may improve the substrate because it treats the workspace itself as the virtual filesystem, supports richer command routing, and has a snapshot/clone model. This spike should verify that with code and harness evidence, not assumptions.

## Requirements Trace

- R1. Preserve the current external CLI contract: `datafetch mount`, `datafetch run`, `datafetch commit`, `datafetch apropos`, and `datafetch man`.
- R2. Preserve the Datafetch runtime contract: committed answers must return `df.answer(...)`, include evidence and derivation, pass validation, and produce lineage.
- R3. Mount the same visible workspace shape under Mirage: `/AGENTS.md`, `/CLAUDE.md`, `/df.d.ts`, `/db`, `/lib`, `/lib/skills`, `/scripts`, `/tmp`, `/result`, and `/.datafetchignore`.
- R4. Make `/lib` intent-local during execution. Promotion into tenant baseline must be explicit, not a side effect of writing in the workspace.
- R5. Commit must snapshot the workspace tree through `/.datafetchignore`, including TypeScript helpers and Flue skill markdown sidecars used by the answer.
- R6. Replay must be able to run from the committed snapshot without depending on drifted ambient tenant files.
- R7. The current Q1/Q2 acceptance harness must pass on the Mirage runtime with the same expected answers and learned-function reuse assertions.
- R8. The spike must demonstrate at least one Mirage-specific advantage, such as per-resource or per-filetype command routing for dataset evidence previews.
- R9. If Mirage only reaches parity while increasing complexity, the branch should preserve any portable snapshot/worktree improvements and leave just-bash as the MVP substrate.

## Scope Boundaries

- No hosted multi-tenant control plane.
- No wholesale migration of all tests before the parity harness passes.
- No raw dataset mirroring into the workspace snapshot.
- No hidden auto-router that rewrites client snippets to learned functions.
- No change to the visible reusable unit: learned interfaces remain typed `df.lib.*` functions backed by flat TypeScript files and optional Flue skill markdown.
- No dependency on FUSE for parity. FUSE is a follow-up UX path, not a blocker for this spike.

## Context & Research

- `kb/br/13-strukto-mirage-vfs.md`: Mirage validates the unified VFS pattern and identifies snapshot/clone, per-resource command routing, provision dry-run, and optional FUSE as the useful primitives to evaluate.
- `kb/plans/006-vfs-native-discovery-and-reuse.md`: The current Datafetch direction keeps `/db` read-only, `/lib` as typed learned functions, and the VFS as the discovery/reuse surface.
- Commit `999c20b`: current just-bash baseline with passing agent-loop reuse proof.

## Architecture

The spike should keep Datafetch above the substrate boundary:

```text
+--------------------------- Agent ----------------------------+
| reads/writes files, runs datafetch commands, commits answer  |
+------------------------------+-------------------------------+
                               |
                               v
+--------------------- Datafetch CLI/runtime ------------------+
| mount, run, commit, apropos, man, df.answer validation       |
| trajectory recording, observer gate, crystallisation         |
+------------------------------+-------------------------------+
                               |
                               v
+--------------------- VFS substrate adapter ------------------+
| current: just-bash MountableFs                               |
| spike: Mirage Workspace                                      |
+------------------------------+-------------------------------+
                               |
                               v
+---------------------- Dataset resources ---------------------+
| Atlas-backed /db interface, tenant /lib baseline, snapshots  |
+--------------------------------------------------------------+
```

The branch should introduce a substrate seam rather than scatter Mirage imports through the product layer.

| Component | Responsibility |
| --- | --- |
| `src/runtime/substrate/*` | New adapter interface for workspace file operations and shell execution. |
| `src/runtime/substrate/justBash*` | Existing behavior wrapped behind the adapter where practical. |
| `src/runtime/substrate/mirage*` | Mirage-backed implementation for the parity spike. |
| `src/cli/workspace.ts` | Keep command semantics stable; route workspace materialization and snapshot through the substrate seam. |
| `src/cli/workspaceSnapshot.ts` | Snapshot VFS tree through `/.datafetchignore`, hash files, and write replayable commit artifacts. |
| `src/bash/session.ts` | Either remains the just-bash implementation or is wrapped as the legacy substrate. |
| `scripts/acceptance/agent-loop.sh` | Add a runtime selector and run the same Q1/Q2 scenario against both substrates. |

## Milestones

1. **Commit/snapshot independent of Mirage**: Add `/.datafetchignore`, workspace tree hashing, file inclusion rules, and dependency closure capture to the current commit path. This must work on just-bash/disk first. *Effort: Medium (< 1d).*
2. **Substrate seam**: Define a small adapter around shell execution, file read/write/list/stat, mount setup, and snapshot walking. Keep the current implementation as the default. *Effort: Medium (< 1d).*
3. **Mirage workspace prototype**: Create a Mirage-backed workspace with `/db`, `/lib`, `/scripts`, `/tmp`, and `/result` mounted for one intent. Reuse the existing snippet runtime and validation. *Effort: Large (> 1d).*
4. **Intent-local `/lib` and promotion boundary**: Ensure Mirage workspaces branch `/lib` per intent, then promote selected files into tenant baseline only after validation/observer approval. *Effort: Medium (< 1d).*
5. **Flue skill sidecar proof**: Have a client-authored `lib/skills/*.md` and `lib/*.ts` `agent({ skill })` function included in the committed snapshot and replay. *Effort: Medium (< 1d).*
6. **Harness parity and comparison**: Run Q1/Q2 on both runtimes and produce a narrative comparing answer quality, reuse, lineage, snapshot contents, and complexity. *Effort: Medium (< 1d).*
7. **Mirage-specific advantage**: Implement one command-routing improvement that is awkward in the current stack, for example a dataset-aware `cat` preview for evidence files by type/resource. *Effort: Short (< 4h).*

## Files to Modify

| File | Changes |
| --- | --- |
| `package.json` | Add Mirage dependency only in the spike branch once the adapter is ready. |
| `src/cli/workspace.ts` | Route mount/run/commit through snapshot and substrate seams while preserving CLI behavior. |
| `src/cli/workspaceSnapshot.ts` | New snapshot writer for committed worktree state. |
| `src/runtime/substrate/types.ts` | New substrate interface. |
| `src/runtime/substrate/justBash.ts` | Legacy adapter or compatibility wrapper. |
| `src/runtime/substrate/mirage.ts` | Mirage-backed adapter. |
| `src/snippet/runtime.ts` | Keep validation semantics stable; avoid substrate-specific branching where possible. |
| `scripts/acceptance/agent-loop.sh` | Add runtime selector and snapshot assertions. |
| `tests/*workspace*.test.ts` | Add snapshot, ignore, replay, and runtime parity coverage. |

## Verification

1. `pnpm typecheck` passes.
2. `pnpm test` passes.
3. `bash scripts/acceptance/run-all.sh` passes on the default just-bash runtime.
4. `DATAFETCH_RUNTIME=mirage bash scripts/acceptance/intent-workspace.sh` passes.
5. `DATAFETCH_RUNTIME=mirage AGENT_LOOP_TIMEOUT=600 bash scripts/acceptance/agent-loop.sh` passes.
6. Q1 snapshot includes `scripts/answer.ts`, any helper files, `lib/*.ts`, `lib/skills/*.md`, `df.d.ts`, `AGENTS.md`, lineage, validation, and replay metadata.
7. Q2 committed source calls the learned `df.lib.*` interface directly.
8. Replay from Q1 snapshot succeeds after tenant ambient `lib/` is modified, proving snapshot independence.
9. Narrative artifact compares just-bash and Mirage runs with answer values, lineage calls, snapshot file counts, and missed-reuse warnings.

## Decision Audit Trail

| # | Phase | Decision | Classification | Principle | Rationale |
| --- | --- | --- | --- | --- | --- |
| 1 | Scope | Keep Mirage in an isolated branch/worktree until parity is proven. | Architecture | Reversibility | The current just-bash runtime has a passing reuse harness and should remain the stable baseline. |
| 2 | Architecture | Put Mirage behind a substrate seam instead of importing it throughout Datafetch. | Architecture | Isolation | The Datafetch product contract should not depend on a specific VFS implementation. |
| 3 | Architecture | Implement full workspace snapshots before Mirage migration. | Ordering | Testability | Snapshot correctness is required regardless of substrate and gives a baseline for comparison. |
| 4 | Scope | Do not require FUSE for parity. | Scope | Focus | FUSE improves local folder UX, but the learning loop can be tested through the VFS API first. |
| 5 | Product | Keep `df.lib.*` and `df.answer(...)` as the stable surface. | Product | Continuity | Mirage should strengthen the substrate, not replace the intent-shaped interface thesis. |
