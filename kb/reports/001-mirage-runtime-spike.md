---
title: "Mirage runtime spike report"
date: 2026-05-07
branch: "005-mirage-runtime-spike"
status: "parked"
recommendation: "keep just-bash as mainline default; keep Mirage as an opt-in substrate spike"
---

# Mirage Runtime Spike Report

## Branch

The Mirage work is isolated on:

```text
005-mirage-runtime-spike
```

Commit stack:

```text
5351347 feat: add mirage bash runtime spike
4fc9a44 feat: snapshot committed intent worktrees
fb5d958 plan: start mirage runtime parity spike
```

This branch should remain separate from the mainline just-bash implementation until Mirage proves a product-level advantage beyond runtime parity.

## What We Built

The spike adds Mirage as an opt-in bash substrate without changing the default Datafetch product path.

Implemented:

- Added `@struktoai/mirage-node`.
- Added `src/bash/mirageSession.ts`.
- Added `src/bash/types.ts` as a small runtime seam.
- Wired runtime selection into `/v1/bash` with `DATAFETCH_BASH_RUNTIME=mirage`.
- Wired runtime selection into `datafetch agent --runtime mirage`.
- Preserved the existing agent affordances:
  - `cat /AGENTS.md`
  - `ls /db /lib`
  - `man <fn>`
  - `apropos <query>`
  - `npx tsx ...`
  - `pnpm exec tsx ...`
  - `yarn tsx ...`
- Mounted `/db/<mount>` as read-only Mirage resources.
- Mounted `/lib` as writable and flushed authored `.ts` / `.md` files back to tenant disk state before snippet execution.

## Verification

Default just-bash path:

```bash
pnpm typecheck
pnpm exec vitest run tests/server-v1bash.test.ts tests/cli-plan-execute.test.ts
pnpm test
bash scripts/acceptance/run-all.sh
```

Mirage opt-in path:

```bash
DATAFETCH_BASH_RUNTIME=mirage pnpm test
DATAFETCH_BASH_RUNTIME=mirage bash scripts/acceptance/run-all.sh
```

Observed results:

```text
pnpm test
  191 Vitest tests passed, plus smoke harnesses

DATAFETCH_BASH_RUNTIME=mirage pnpm test
  191 Vitest tests passed, plus smoke harnesses

bash scripts/acceptance/run-all.sh
  session-switch: 14/14
  intent-workspace: 38/38
  agent-loop: skipped by default
  llm-body-loop: skipped by default

DATAFETCH_BASH_RUNTIME=mirage bash scripts/acceptance/run-all.sh
  session-switch: 14/14
  intent-workspace: 38/38
  agent-loop: skipped by default
  llm-body-loop: skipped by default
```

## Key Finding

Mirage reached parity as an opt-in `/v1/bash` substrate, but parity alone is not a reason to migrate the MVP away from just-bash.

The current product-level value around worktrees, visible code, commit artifacts, replay tests, and learning boundaries is coming from the Datafetch commit/snapshot layer. Mirage did not replace that yet.

## Agent Experience Finding

The first issue Mirage exposed was an agent-experience mismatch:

```bash
ls /db /lib
```

This failed initially because `/db` and `/lib` live on separate Mirage mounts, and Mirage rejected the cross-mount `ls`.

That behavior is architecturally coherent but agent-hostile. Agents naturally inspect multiple folders at once. The spike added a compatibility shim for multi-path `ls`.

This is the practical reason not to switch by default yet: Mirage gives us stronger substrate concepts, but we still need to smooth shell-compatibility edges.

## Recommendation

Keep `just-bash` as the mainline runtime for now.

Reasons:

- It is already simpler for the current MVP.
- It behaves closer to the shell agents expect.
- Existing docs, tests, prompts, and examples match it.
- It has fewer compatibility surprises in common exploratory commands.
- It is sufficient for proving the current Datafetch thesis: VFS discovery, visible TypeScript, `df.answer(...)`, commit snapshots, replay tests, and learned interface reuse.

Keep Mirage parked as an opt-in spike.

Reasons:

- It expresses per-resource read/write mount modes cleanly.
- It gives a more plausible path toward FUSE-mounted intent worktrees.
- It could support richer resource-aware command routing.
- It may be a better long-term server data-plane substrate if we start using those capabilities directly.

## What This Does Not Prove

This spike does not prove that Mirage improves answer quality, reuse quality, or crystallisation adherence.

It also does not yet give us real Git-style worktree semantics. We have Datafetch workspace snapshots, not actual Git-backed VFS commits.

The next useful Mirage experiment is therefore not another parity run. It should test one Mirage-native advantage directly.

## Next Useful Experiment

Run a focused experiment where Mirage is allowed to do something just-bash does not naturally do.

Candidate:

```text
Resource-aware command routing:
  cat /db/finqa/cases/<evidence>.json
  datafetch preview /db/finqa/cases/<evidence>
  rg "revenue" /db/finqa/cases
```

Measure:

- Does the agent discover the right evidence faster?
- Does it write better visible `scripts/answer.ts` code?
- Does the final commit include better evidence and derivation?
- Does the server get cleaner lineage for distillation?

Only if Mirage improves that loop should we consider moving it toward mainline.

## Mainline Position

Mainline should stay on the just-bash implementation.

The Mirage branch should be treated as a parked experiment branch:

```text
005-mirage-runtime-spike
```

Do not merge it into mainline until the branch demonstrates a product-level advantage, not just runtime parity.
