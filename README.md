<!-- datafetch -->

```text
     _       _        __      _       _
  __| | __ _| |_ __ _ / _| ___| |_ ___| |__
 / _` |/ _` | __/ _` | |_ / _ \ __/ __| '_ \
| (_| | (_| | || (_| |  _|  __/ || (__| | | |
 \__,_|\__,_|\__\__,_|_|  \___|\__\___|_| |_|

  your queries / your interface
  a dataset harness for coding agents
```

Repository: <https://github.com/JayFarei/datafetch> · Site: <https://datafetch.ai>

## Get it going

Paste this prompt into your coding agent (Claude Code, Codex, Pi, or OpenCode) and let it bootstrap datafetch and reproduce the SkillCraft result end to end:

```text
Set up datafetch, a dataset harness for coding agents
(https://github.com/JayFarei/datafetch), and reproduce its SkillCraft result.
Do this, reading as you go:

1. Clone the repo and read README.md top to bottom.
2. Install it: `pnpm install`.
3. Read eval/skillcraft/README.md to understand the three arms
   (skillcraft-base, skillcraft-skill, datafetch-learned) and the auth/driver
   the harness expects.
4. Run a fast smoke of the datafetch code-mode arm:
     pnpm eval:skillcraft:synthetic:live:smoke
   This drives a coding agent over a few SkillCraft tasks and crystallises
   df.lib.* helpers from accepted trajectories.
5. Inspect what was learned: open the mounted workspace's lib/ and the run
   artifacts, and explain which accepted trajectory became a typed,
   replay-gated df.lib.* call that later tasks reuse instead of re-deriving.
6. For the full 126-task suite behind the 94.4% headline, follow the
   reproducible flow in eval/skillcraft/README.md and run `pnpm eval:skillcraft`.

Then tell me what crystallised into lib/, and how warm-path reuse moved
correctness, token cost, and tool work versus the cold run.
```

Want a different shape than SkillCraft? Swap step 4/6 for any of the harnesses in [Dataset shapes we've tried](#dataset-shapes-weve-tried), or use the generic product path below (`server -> attach -> add -> mount -> run -> commit`) over your own Hugging Face dataset.

---

datafetch is a dataset harness for coding agents. It exposes a mounted dataset
as a bash-shaped workspace with typed TypeScript handles, writable intent
scripts, structured run artifacts, and tenant-local learned interfaces.

The rule is deliberately narrow:

```text
The system only learns from data-molding logic that was written into the
workspace and executed by datafetch.
```

Agents can inspect freely. Reusable learning comes from committed visible code
that returns `df.answer(...)` with evidence, coverage, derivation, and lineage.

## Dataset shapes we've tried

The thesis only bites when the same dataset is queried repeatedly with reusable intent structure. To find where that holds and where it doesn't, we built harnesses across deliberately different data shapes. Honest results, including the negatives:

| Dataset | Data shape | What it probed | Outcome |
|---|---|---|---|
| **SkillCraft** | Synthetic tool-composition families (21 families × 6 difficulty levels, 126 tasks) fanning out over real tool APIs | Reuse rate, token amortisation, and a 7-arm governance / persistence ablation | **94.4% pass (119/126)** at ~172× lower token cost vs the vanilla ceiling; +7.9pp on the hard tier. Cross-session *cost* amortisation falsified on the hardest fan-out arm — reuse fires, but a one-shot inline rewrite was cheaper there. |
| **FinChain** | Parameterised symbolic financial reasoning chains (58 topics × 5 levels) with step-aligned grading | Correctness vs the published paper baseline; substrate-ON vs substrate-OFF | Matches/exceeds the paper baseline. Pure-compute trajectories give the crystallisation gate nothing to learn → substrate delta structurally ≈ 0. |
| **CRAG** | Open-domain web QA across 5 domains (2,706 rows, 8 question types, tri-state grading) | Governance-under-staleness; zero-source SDK onboarding | Corpus + grader built. Shape probe found tool-only trajectories collapse to a single fan-out signature, and within-session reuse = 0 — a correctness landmine, not a win. |
| **FinQA** | Tabular S&P 500 10-K filing QA (8,281 pairs) with compilable arithmetic gold programs | The cold `db/` → warm `lib/` arc; gold programs as the template for crystallised helpers | Seed library + original demo spine. The first proof that an accepted trajectory can become a typed, reusable `df.lib.*` call. |
| **ProductFlow** | 3-episode micro-eval over a live REST API (jsonplaceholder) | The full crystallise → discover → reuse loop on a real product API outside SkillCraft | ~1.7× token delta. Auto-crystallised helpers came out *thinner* than the model's inline rewrite — this set our adversarial baseline (inline-rewrite, no persistence). |
| **OpenTraces** | Private polymorphic event-log store (~11.6GB: 1,592 traces, 861k events, 13+ discriminated event types, 4 developer personas) | Correctness on a genuinely model-prior-free store; per-tenant library divergence | Corpus sealed, 200+ question pack built; spread probe passed (median ~55× amortisation surface). Current primary instrument for the correctness claim. |

Also scouted but not yet harnessed: **τ³-bench** (multi-turn policy/transactional agent tasks), **BIRD-SQL** (cross-database text-to-SQL), and **FinReflectKG-MultiHop / FinAgentBench** (document-grounded financial KG retrieval).

## Quickstart

```sh
pnpm install
npm link            # or: pnpm link --global

datafetch server --port 8080
```

In another shell:

```sh
datafetch attach http://localhost:8080 --tenant demo

datafetch add https://huggingface.co/datasets/OpenTraces/opentraces-devtime --json
datafetch list --json
datafetch inspect opentraces-devtime --json

datafetch mount opentraces-devtime \
  --tenant demo \
  --intent "Find traces about debugging and produce an evidence-backed summary"
```

The mount command creates an intent workspace. `cd` into it and work like a
small code project:

```sh
cat AGENTS.md
cat df.d.ts
ls db lib scripts

datafetch run scripts/scratch.ts
datafetch commit scripts/answer.ts
cat result/answer.md
cat result/validation.json
```

## Workspace Contract

Each mounted intent workspace is a worktree-shaped environment:

```text
AGENTS.md
CLAUDE.md -> AGENTS.md
df.d.ts
db/
lib/
scripts/
  scratch.ts
  answer.ts
  helpers.ts
tmp/runs/
result/
```

The directories have stable meanings:

- `db/` is immutable dataset context and typed collection primitives.
- `lib/` is the tenant-local learned-interface surface.
- `scripts/` is writable user space for visible intent programs.
- `tmp/runs/` contains notebook-style exploratory run artifacts.
- `result/` contains the committed answer, lineage, validation, replay test,
  and worktree commit history.

`datafetch run` is exploratory. `datafetch commit` is the final answer path.
Only committed visible code that passes validation is eligible for learning.

## Dataset Initialization

The server owns dataset initialization. For the current prototype, supported
datasets are registered from Hugging Face dataset URLs or a server whitelist.
Initialization publishes the mount, samples the dataset, writes descriptors and
typed handles, then creates source templates for future workspaces:

```text
$DATAFETCH_HOME/sources/<source-id>/
  source.json
  manifest.json
  adapter-profile.json
  init-context.json
  init-agent.json
  templates/
    AGENTS.md
    CLAUDE.md
    scripts/scratch.ts
    scripts/answer.ts
```

The init template can be deterministic or authored through the Flue-backed
`datafetch_init_mount_template` skill. The client agent does not need to know
which path produced the template; it just receives a normal workspace.

## CLI Surface

```text
Server:
  datafetch server [--port 8080] [--base-dir <path>] [--datasets <file>]

Client/catalog:
  datafetch attach <server-url> --tenant <id>
  datafetch add <dataset-url> [--id <local-id>] [--json]
  datafetch list [--json]
  datafetch inspect <source-id> [--json]

Intent workspace:
  datafetch mount <source-id> --tenant <id> --intent '<intent>' [--path <dir>]
  datafetch run [scripts/scratch.ts]
  datafetch commit [scripts/answer.ts]

Discovery:
  datafetch apropos <query> [--json]
  datafetch man <df.lib.name>

Legacy/demo:
  datafetch session ...
  datafetch plan ...
  datafetch execute ...
  datafetch tsx ...
  datafetch publish <mount-id> --uri <atlas-uri> --db <db-name>
  datafetch demo [--mount finqa-2024] [--no-cache]
```

The default product path is `server -> attach -> add/list/inspect -> mount ->
run -> commit`.

## Seed Packs

Generic seed functions and skills live under:

```text
seeds/generic/
```

Domain-specific demo/eval packs live under:

```text
seeds/domains/<domain>/
```

By default the runtime mirrors only generic seeds into
`$DATAFETCH_HOME/lib/__seed__/`. To expose a domain pack, pass
`seedDomains` in code or set:

```sh
DATAFETCH_SEED_DOMAINS=finqa
```

The FinQA table helpers remain available for the historical demo and live
acceptance scripts, but they are no longer part of every generic dataset mount.

## Test Harnesses

Fast local verification:

```sh
pnpm typecheck
pnpm test
```

Acceptance harnesses:

```sh
bash tests/acceptance/run-all.sh
```

The default acceptance run covers no-LLM/no-Atlas flows plus the public
Hugging Face catalog path. Live client-agent and Atlas/FinQA loops are opt-in:

```sh
RUN_AGENT_E2E=1 ATLAS_URI='mongodb+srv://...' bash tests/acceptance/run-all.sh
```

The harness matrix is documented in
[`tests/acceptance/README.md`](./tests/acceptance/README.md).

## Telemetry For Evals

Set these during benchmark runs:

```sh
DATAFETCH_TELEMETRY=1
DATAFETCH_TELEMETRY_LABEL=<scenario-or-benchmark-id>
DATAFETCH_SEARCH_MODE=<baseline|learned|adapter-name>
```

Telemetry is written under:

```text
$DATAFETCH_HOME/telemetry/events.jsonl
```

Each event captures the snippet phase, trajectories, call primitives, cost
signals, answer status, validation, and enough labels to compare datafetch
against alternative agentic search baselines.

## Environment

- `DATAFETCH_HOME` - server/workspace state root. Defaults to `<cwd>/.datafetch`.
- `DATAFETCH_SERVER_URL` - client default server URL.
- `DATAFETCH_SESSION` - legacy snippet/session fallback.
- `DATAFETCH_SEED_DOMAINS` - comma-separated optional seed packs.
- `DATAFETCH_INIT_MODEL` - model for LLM-authored dataset init templates.
- `DATAFETCH_LLM_MODEL` / `DF_LLM_MODEL` - fallback model for Flue agent bodies.
- `HF_DATASETS_SERVER_URL` - override Hugging Face Dataset Viewer endpoint.
- `ATLAS_URI` / `MONGODB_URI` - optional Atlas demo/eval connection string.
- `ATLAS_DB_NAME` / `MONGODB_DB_NAME` - optional Atlas database override.
- `DATAFETCH_SKIP_ENV_FILE=1` - skip automatic `.env` loading.

Legacy `ATLASFS_HOME` and `ATLASFS_SKIP_ENV_FILE` are still honored for old
local setups.

## Source Layout

The substrate (`src/`) is dataset-neutral. Each dataset/benchmark lives
under its own `eval/<dataset>/` directory and plugs into the substrate
through the documented contracts (tool bridge, adapter profile, answer
kit). Adding a dataset should not require a `src/` change. See
[architecture.md § the substrate / dataset boundary](./kb/docs/architecture.md).

```text
bin/                  CLI binary shim
kb/docs/              product, runtime, learning-loop, architecture, eval docs
kb/                   knowledge base (plans, prd, background research, archive)
skills/datafetch/     installable client-agent skill
tests/                vitest unit/integration tests (substrate)
tests/acceptance/     substrate CLI/server e2e acceptance harnesses
experiments/          experiment log by episode (episodes/ + log/)

eval/                 ALL eval work (depends on src/, never the reverse)
eval/harness/         eval drivers (skillcraft/finchain/sac/crag runners)
eval/seeds/           substrate seed library: generic + domain packs
                      (runtime-loaded via locateRepoSubdir("eval/seeds/..."))
eval/tests/           eval-specific vitest suites (sac-*, crag, planner)
eval/scripts/         cross-suite eval orchestration scripts
eval/skillcraft/      SkillCraft benchmark harness (21 families x 6 levels)
eval/productFlow/     non-benchmark product-flow cross-eval
eval/finchain/        FinChain benchmark harness
                      (each: configs, prepare/runner scripts,
                       results/ — gitignored)

src/runtime/          cross-cutting substrate utilities: answer-kit emitter
                      + generic syntax-slip rewriters, tool catalog types
src/snippet/          TypeScript snippet runtime + df.* binding + tool bridge
src/observer/         trajectory gate and learned-interface authoring
src/hooks/            VFS hook registry (df.lib.<name> contract surface)
src/adapter/          dataset substrate adapters
src/bootstrap/        sample, infer, synthesize, manifest emit
src/bash/             just-bash session integration
src/cli/              CLI command implementations
src/demo/             FinQA two-question demo
src/discovery/        library search / apropos
src/flue/             Flue dispatcher and skill loading
src/sdk/              public TypeScript SDK primitives
src/server/           Hono data plane and catalog routes
src/trajectory/       call-scope and lineage recording
```

Local generated state stays ignored: `.datafetch/`, `.atlasfs/`,
`.snippet-cache/`, `artifacts/`, `dist/`, and every
`eval/<dataset>/results/`.

## Docs

- [Architecture + the substrate / dataset boundary](./kb/docs/architecture.md)
- [How datafetch works](./kb/docs/how-it-works.md)
- [How datafetch improves over time](./kb/docs/improvement-loop.md)
- [Benchmarking the datafetch thesis](./kb/docs/benchmarking.md)

## Status

Prototype. The current useful slice is:

1. local server;
2. Hugging Face source registration;
3. dataset initialization templates;
4. intent workspace mount;
5. run/commit artifacts;
6. telemetry;
7. optional FinQA learned-interface demo.

Next step: run structured evals comparing normal agentic search against the
dataset harness path over repeated intent families.
