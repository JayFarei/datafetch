// runProductFlowMicroEval — the P2 product-flow micro-eval harness.
//
// Two-arm, three-episode evaluation against the jsonplaceholder tool
// bundle. Proves the datafetch substrate's learning loop generalises to
// a non-SkillCraft tool bundle: e1 is cold; the observer (substrate-on
// only) crystallises a helper into the per-tenant lib overlay; e2 + e3
// discover that helper via the substrate's apropos / df.d.ts / man
// surface (NEVER by name in the prompt) and reuse it.
//
// The control arm (substrate-off) sees the same per-episode prompt body
// (gold-answer question + tool catalogue) but with no observer, no seed,
// and no "Learned interfaces" section. Effective-token deltas measure
// whether the substrate-on arm is materially cheaper at e2/e3.
//
// CLI:
//   pnpm tsx src/eval/productFlow/runProductFlowMicroEval.ts \
//     --arm substrate-on \
//     --out-dir eval/productFlow/results/p2-substrate-on-20260517
//
// Optional flags:
//   --task e1|e2|e3   run a single episode (default: all three in order)
//   --dry-run         render the prompt to disk; skip the Claude spawn
//
// Inviolable constraints (enforced harness-side; throws if violated):
//   - the rendered prompt MUST NOT contain `per_entity`, `__seed__`,
//     `learnedHelper`, or any explicit `df.lib.<name>` (the bare token
//     `df.lib` is fine; we only reject helper-name leakage).
//   - same prompt body in BOTH arms except the conditional learned-
//     interfaces section.
//
// CRITICAL: this module sets `process.env.DATAFETCH_CONVERGENCE_N = "1"`
// BEFORE importing the observer. The observer reads this once via
// `convergenceThreshold()`; setting it after the import is a no-op.

import { spawn } from "node:child_process";
import { promises as fsp } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";

// Lock the convergence threshold to 1 (every gate-clearing trajectory
// triggers crystallisation on its first occurrence). MUST happen before
// the observer module is imported because the observer reads the env
// once at install time.
process.env["DATAFETCH_CONVERGENCE_N"] = "1";

import { installSnippetRuntime } from "../../snippet/install.js";
import { installObserver } from "../../observer/install.js";
import { regenerateManifest } from "../../server/manifest.js";
import { regenerateWorkspaceMemory } from "../../bootstrap/workspaceMemory.js";
import {
  readTrajectory,
  type TrajectoryRecord,
} from "../../sdk/index.js";

import { renderPerEntitySeed } from "../evalRecords.js";

import {
  JSONPLACEHOLDER_BUNDLE_NAME,
  JSONPLACEHOLDER_TOOLS,
  buildJsonplaceholderBridgeConfig,
} from "./jsonplaceholderTools.js";

// --- Constants -------------------------------------------------------------

const TENANT_ID = "productflow-jsonplaceholder";
const DEFAULT_MODEL = "claude-sonnet-4-6";
const CONVERGENCE_N = 1;
const AGENT_TIMEOUT_MS = 8 * 60 * 1000;
const SNIPPET_TIMEOUT_MS = 60 * 1000;
const OBSERVER_AWAIT_MS = 5_000;

type Arm = "substrate-on" | "substrate-off";
type EpisodeId = "e1" | "e2" | "e3" | "e4";

interface EpisodeSpec {
  id: EpisodeId;
  question: string;
  gold: unknown;
}

const EPISODES: readonly EpisodeSpec[] = [
  {
    id: "e1",
    question:
      "Fetch the user whose id is 1 from the jsonplaceholder tool bundle and write `scripts/answer.ts` so that running it prints exactly `{\"name\": \"...\", \"email\": \"...\"}` for that user.",
    gold: { name: "Leanne Graham", email: "Sincere@april.biz" },
  },
  {
    id: "e2",
    question:
      "Fetch the users whose ids are 2, 3, and 4 from the jsonplaceholder tool bundle and write `scripts/answer.ts` so that running it prints a JSON array with one `{\"name\": \"...\", \"email\": \"...\"}` object per user, in id order.",
    gold: [
      { name: "Ervin Howell", email: "Shanna@melissa.tv" },
      { name: "Clementine Bauch", email: "Nathan@yesenia.net" },
      { name: "Patricia Lebsack", email: "Julianne.OConner@kory.org" },
    ],
  },
  {
    id: "e3",
    // Fanout-shape warm task: same composition as e2 (repeated getUser
    // over an entity set) but different ids and projecting a different
    // field (website instead of email). The crystallised helper from
    // e2's trajectory should be reusable here under substrate-on.
    question:
      "Fetch the users whose ids are 5, 6, and 7 from the jsonplaceholder tool bundle and write `scripts/answer.ts` so that running it prints a JSON array with one `{\"name\": \"...\", \"website\": \"...\"}` object per user, in ascending id order.",
    gold: [
      { name: "Chelsey Dietrich", website: "demarco.info" },
      { name: "Mrs. Dennis Schulist", website: "ola.org" },
      { name: "Kurtis Weissnat", website: "elvis.io" },
    ],
  },
  {
    id: "e4",
    // Big-task probe: multi-hop AND multi-entity. 1 getUsers + 10
    // getPostsByUser + per-user aggregation. With toolFanout the agent
    // can collapse 10 raw calls into one df.lib.toolFanout. Tests
    // whether the agent's natural exploration threshold fires when
    // the task is meaningfully bigger than e1-e3.
    question:
      "Fetch every user from the jsonplaceholder tool bundle, and for each user count how many posts they have authored. Write `scripts/answer.ts` so that running it prints a JSON array of `{\"name\": \"...\", \"postCount\": <integer>}` objects sorted by postCount descending, with ties broken by name ascending.",
    gold: [
      { name: "Chelsey Dietrich", postCount: 10 },
      { name: "Clementina DuBuque", postCount: 10 },
      { name: "Clementine Bauch", postCount: 10 },
      { name: "Ervin Howell", postCount: 10 },
      { name: "Glenna Reichert", postCount: 10 },
      { name: "Kurtis Weissnat", postCount: 10 },
      { name: "Leanne Graham", postCount: 10 },
      { name: "Mrs. Dennis Schulist", postCount: 10 },
      { name: "Nicholas Runolfsdottir V", postCount: 10 },
      { name: "Patricia Lebsack", postCount: 10 },
    ],
  },
] as const;

// --- Tool catalogue --------------------------------------------------------

// Per-tool one-line signature for the "Available tool bundles" section.
// Hand-derived from the runner contract; kept short on purpose so the
// agent gets the surface without prose padding.
const TOOL_SIGNATURES: Record<string, { args: string; returns: string }> = {
  getUsers: { args: "()", returns: "{ success, users: Array<User> }" },
  getUser: { args: "({ id: number })", returns: "{ success, user: User }" },
  getPosts: { args: "()", returns: "{ success, posts: Array<Post> }" },
  getPostsByUser: {
    args: "({ userId: number })",
    returns: "{ success, posts: Array<Post> }",
  },
  getCommentsByPost: {
    args: "({ postId: number })",
    returns: "{ success, comments: Array<Comment> }",
  },
};

// --- CLI args --------------------------------------------------------------

interface Args {
  arm: Arm;
  outDir: string;
  task?: EpisodeId;
  dryRun: boolean;
  // When true (substrate-on only), the prompt inlines the rendered
  // df.d.ts contents directly instead of instructing the agent to
  // `cat` it. This converts the discovery loop's expensive
  // output-token turns into cheap cached-input tokens. The substrate
  // mechanics (observer, seed, crystallisation) are unchanged.
  manifestInline: boolean;
  // When true (substrate-on only), each episode mirrors
  // <baseDir>/lib/{__seed__,<tenant>}/ into the episode's workspace
  // under workspace/lib/. The prompt drops the entire
  // Learned-interfaces section and only adds a one-line pointer in
  // the workspace section. The agent discovers helpers by the same
  // filesystem instincts it uses on any repo (ls, cat) — no special
  // manifest channel. Runtime still routes through df.lib.<name>;
  // the mirror is for discovery only.
  workspaceLib: boolean;
  // Absolute path to a directory whose .ts files are copied into
  // <baseDir>/lib/<tenantId>/ after setupArm wipes the workspace. Used
  // to inject hand-authored "rich" helpers for the
  // composition-density / input-clarity experiment.
  preseedHelpersDir?: string;
  // Absolute path to a directory whose files (e.g. CLAUDE.md) are copied
  // into the per-episode workspace AFTER the substrate's mirror runs.
  // Used to override the substrate-default workspace memory with a
  // more directive variant for the project-steer experiments.
  workspaceOverlayDir?: string;
}

function parseArgs(argv: string[]): Args {
  let arm: Arm | undefined;
  let outDir: string | undefined;
  let task: EpisodeId | undefined;
  let dryRun = false;
  let manifestInline = false;
  let workspaceLib = false;
  let preseedHelpersDir: string | undefined;
  let workspaceOverlayDir: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--arm") {
      const v = argv[++i];
      if (v !== "substrate-on" && v !== "substrate-off") {
        throw new Error(`--arm must be 'substrate-on' or 'substrate-off' (got '${v}')`);
      }
      arm = v;
    } else if (key === "--manifest-inline") {
      manifestInline = true;
    } else if (key === "--workspace-lib") {
      workspaceLib = true;
    } else if (key === "--preseed-helpers") {
      const v = argv[++i];
      if (!v) throw new Error("--preseed-helpers requires a path");
      preseedHelpersDir = path.resolve(v);
    } else if (key === "--workspace-overlay") {
      const v = argv[++i];
      if (!v) throw new Error("--workspace-overlay requires a path");
      workspaceOverlayDir = path.resolve(v);
    } else if (key === "--out-dir") {
      const v = argv[++i];
      if (!v) throw new Error("--out-dir requires a value");
      outDir = v;
    } else if (key === "--task") {
      const v = argv[++i];
      if (v !== "e1" && v !== "e2" && v !== "e3" && v !== "e4") {
        throw new Error(`--task must be one of e1, e2, e3, e4 (got '${v}')`);
      }
      task = v;
    } else if (key === "--dry-run") {
      dryRun = true;
    } else {
      throw new Error(`unknown flag: ${key}`);
    }
  }
  if (!arm) throw new Error("--arm is required");
  if (!outDir) throw new Error("--out-dir is required");
  if (manifestInline && arm !== "substrate-on") {
    throw new Error("--manifest-inline only applies to --arm substrate-on");
  }
  if (workspaceLib && arm !== "substrate-on") {
    throw new Error("--workspace-lib only applies to --arm substrate-on");
  }
  if (workspaceLib && manifestInline) {
    throw new Error("--workspace-lib and --manifest-inline are mutually exclusive");
  }
  return {
    arm,
    outDir: path.resolve(outDir),
    task,
    dryRun,
    manifestInline,
    workspaceLib,
    ...(preseedHelpersDir !== undefined ? { preseedHelpersDir } : {}),
    ...(workspaceOverlayDir !== undefined ? { workspaceOverlayDir } : {}),
  };
}

// --- Prompt rendering ------------------------------------------------------

function renderToolBundlesSection(): string {
  const lines: string[] = [];
  lines.push("# Available tool bundles");
  lines.push("");
  lines.push(`Bundle: \`${JSONPLACEHOLDER_BUNDLE_NAME}\` (HTTP-backed, JSONPlaceholder REST API)`);
  lines.push("");
  for (const name of JSONPLACEHOLDER_TOOLS) {
    const sig = TOOL_SIGNATURES[name];
    if (!sig) {
      throw new Error(`missing tool signature for '${name}'`);
    }
    lines.push(
      `- \`df.tool.${JSONPLACEHOLDER_BUNDLE_NAME}.${name}${sig.args}\` -> Promise<${sig.returns}>`,
    );
  }
  return lines.join("\n");
}

function renderSubstratePrimitivesSection(): string {
  return [
    "# Available substrate primitives",
    "",
    "- `df.tool.<bundle>.<name>(input) -> { success, ...payload }` — call a registered tool.",
    "- `df.lib.<helperName>(input) -> { value, ...meta }` — call a learned/seed helper. Unwrap with `(await df.lib.<helperName>(input)).value`.",
    "- `df.answer(value)` — return the final answer envelope; useful when running inside the substrate runner.",
  ].join("\n");
}

// workspace-lib variant: a one-line pointer to the lib/ dir that the
// harness mirrored from the substrate's overlay into the workspace.
// No MUST, no helper names, no special "discovery surfaces" — the
// agent uses its native repo-exploration instincts (ls/cat/read code).
function renderWorkspaceLibPointer(): string {
  return [
    "",
    "Your workspace also contains a `lib/` directory with helper modules other agents have left here. You may call any of them via `df.lib.<helperName>(input)` if one matches your task; if none do, just use the tool primitives directly.",
  ].join("\n");
}

function renderWorkspaceSection(): string {
  // CRITICAL: the snippet runtime wraps your file's body as
  //   `export const __df_done = (async () => { <your-body> })();`
  // and the host awaits `__df_done`. Top-level `await` lives directly
  // inside that wrapper — those promises ARE awaited. But a
  // fire-and-forget IIFE `(async () => { await ... })();` returns
  // immediately and its inner awaits run AFTER the host has already
  // finalised the trajectory. Hence the explicit instruction below.
  return [
    "# Workspace",
    "",
    "Write your solution to `scripts/answer.ts`. The file must be a self-contained TypeScript module that uses `df.*` and ends by printing the answer JSON on stdout. The harness runs your file directly; do not invoke it yourself.",
    "",
    "**IMPORTANT — your file MUST use top-level `await`.** Do NOT wrap your work in a fire-and-forget IIFE like `(async () => { ... })();` — the inner awaits will not run inside the harness's snippet runtime.",
    "",
    "Skeleton — use top-level statements directly:",
    "",
    "```ts",
    "// scripts/answer.ts",
    "const result = await df.tool.jsonplaceholder.getUser({ id: 1 });",
    "// ... compose your answer here ...",
    "console.log(JSON.stringify({ /* your answer */ }));",
    "```",
    "",
    "If you prefer naming a function, declare and `await` it at the top level:",
    "",
    "```ts",
    "async function main() {",
    "  const result = await df.tool.jsonplaceholder.getUser({ id: 1 });",
    "  console.log(JSON.stringify({ name: result.user.name, email: result.user.email }));",
    "}",
    "await main();",
    "```",
  ].join("\n");
}

function renderLearnedInterfacesSection(): string {
  // Mentions df.d.ts (primary), apropos, man — never a concrete helper
  // name. The literal `df.lib.<helper-name>` here is a schematic
  // placeholder; the leak validator allows the bare token `df.lib` but
  // rejects any `df.lib.<concrete>`. We use the angle-bracketed
  // `<helper-name>` form (not parseable as an identifier) so the regex
  // passes cleanly. The discovery commands are the REAL CLI verbs:
  // `cat $DATAFETCH_HOME/df.d.ts` is plain file read; `pnpm exec
  // datafetch apropos`/`man` use the in-repo CLI shim at bin/datafetch.mjs.
  return [
    "# Learned interfaces — MANDATORY pre-flight check",
    "",
    "Prior episodes in this workspace may have crystallised reusable helpers under `$DATAFETCH_HOME/lib/<tenant>/`. Calling one when its intent matches is strictly cheaper than calling raw tool primitives, because the substrate records ONE trajectory step for a `df.lib.*` call regardless of how many internal tool calls it makes.",
    "",
    "**Step 1 — BEFORE writing answer.ts, you MUST run this Bash command and read the output:**",
    "",
    "```bash",
    "cat \"$DATAFETCH_HOME/df.d.ts\"",
    "```",
    "",
    "It is a TypeScript declaration file listing every callable `df.lib.*` and `df.tool.*` with JSDoc describing intent, input schema, and a usage example.",
    "",
    "**Step 2 — decide:**",
    "",
    "- If any `df.lib.<name>` entry's JSDoc intent matches your task (e.g. a helper described as `\"repeated tool fan-out\"` or `\"per-entity tool call\"` matches a task that fetches multiple entities by id with the same tool), you MUST call THAT helper instead of looping raw tool calls. Look at its JSDoc example for input shape.",
    "- If no `df.lib.<name>` matches, use the tool primitives directly.",
    "",
    "**Step 3 — when reusing a `df.lib.<name>` helper, ALWAYS inspect its source first** to learn its exact OUTPUT shape (the manifest only shows `Promise<Result<unknown>>` for the return). The source lives at one of these paths:",
    "",
    "```bash",
    "cat \"$DATAFETCH_HOME/lib/__seed__/<name>.ts\"        # seed helpers shipped with the substrate",
    "cat \"$DATAFETCH_HOME/lib/<tenant>/<name>.ts\"        # helpers learned from prior episodes",
    "```",
    "",
    "Use the literal file path you see, substituting the helper's name (and tenant id, found in df.d.ts's `Tenant:` header comment). Read the function's `async body(input)` to see exactly what shape it returns; the substrate wraps that under the `result.value` field of the Result envelope.",
    "",
    "Optional secondary discovery: `pnpm exec datafetch apropos '<intent words>'` and `pnpm exec datafetch man <name>`. But reading `df.d.ts` is the contract.",
    "",
    "Do NOT invent helper names. Only call `df.lib.<name>` if you saw `<name>` declared in df.d.ts.",
  ].join("\n");
}

function renderEpisodePrompt(input: {
  arm: Arm;
  episode: EpisodeSpec;
  manifestInline: boolean;
  workspaceLib: boolean;
  inlinedManifest?: string;
}): string {
  const sections: string[] = [];
  sections.push("# Task");
  sections.push("");
  sections.push(input.episode.question);
  sections.push("");
  sections.push(
    input.workspaceLib
      ? renderWorkspaceSection() + renderWorkspaceLibPointer()
      : renderWorkspaceSection(),
  );
  sections.push("");
  sections.push(renderToolBundlesSection());
  sections.push("");
  sections.push(renderSubstratePrimitivesSection());
  if (input.arm === "substrate-on" && !input.workspaceLib) {
    sections.push("");
    if (input.manifestInline && input.inlinedManifest !== undefined) {
      sections.push(renderInlinedManifestSection(input.inlinedManifest));
    } else {
      sections.push(renderLearnedInterfacesSection());
    }
  }
  return sections.join("\n") + "\n";
}

// Inline-manifest variant: the prompt embeds the current df.d.ts
// contents directly. The agent gets the same discoverability without
// needing 10+ turns of Bash `cat` round-trips. Source-inspection hint
// remains because helper output shapes are typed `unknown` in the
// manifest; the agent still needs to peek at the .ts body for specifics.
function renderInlinedManifestSection(manifestText: string): string {
  return [
    "# Learned interfaces — manifest inlined",
    "",
    "The substrate's TypeScript manifest of every callable `df.lib.*` and `df.tool.*` for this workspace is reproduced below. Read it once; do not `cat` it again. If any `df.lib.<name>` entry's JSDoc intent matches your task (e.g. `\"repeated tool fan-out\"` matches multi-id fetches), call THAT helper instead of looping raw tool calls. If no entry matches, use the tool primitives directly. Do NOT invent helper names — only call names you see below.",
    "",
    "```ts",
    manifestText.trimEnd(),
    "```",
    "",
    "Note: the manifest declares helper return types as `Promise<Result<unknown>>`. If you decide to call a `df.lib.<name>` whose output shape isn't obvious from the JSDoc example, you MAY `cat \"$DATAFETCH_HOME/lib/__seed__/<name>.ts\"` (seed helpers) or `cat \"$DATAFETCH_HOME/lib/<tenant>/<name>.ts\"` (learned helpers) to inspect the function body's exact return shape — but only AFTER you've decided to use it. Don't browse the catalogue twice.",
  ].join("\n");
}

// --- Helper-name leak guard ------------------------------------------------

// Match `df.lib.<identifier>` where <identifier> starts with a letter or
// underscore (real callable) and is NOT an angle-bracketed placeholder.
// The schematic phrase `df.lib.<helperName>` in the substrate-primitives
// block and `df.lib.<helper-name>` in the learned-interfaces section both
// fail this regex because `<` is not a valid identifier start.
const DF_LIB_NAMED_RE = /\bdf\.lib\.([A-Za-z_][A-Za-z0-9_]*)\b/g;

// Tokens that name specific helpers. `__seed__` was previously in this
// list, but it's a substrate-shipped DIRECTORY (where seed helpers live),
// not a helper name itself. Mentioning the directory path in the
// discovery section is part of the legitimate discovery contract.
const FORBIDDEN_NAME_TOKENS: readonly string[] = [
  "per_entity",
  "learnedHelper",
];

function assertNoHelperNameLeak(
  prompt: string,
  episodeId: EpisodeId,
  arm: Arm,
  manifestInline: boolean,
): void {
  // When manifest is inlined, the substrate-rendered df.d.ts legitimately
  // contains every helper name. The leak check then becomes: "the harness
  // author did not HARDCODE any helper name OUTSIDE the inlined manifest
  // block." We strip the fenced ```ts ... ``` block (which holds the
  // manifest verbatim) and run the existing checks on what remains.
  let scanned = prompt;
  if (manifestInline) {
    scanned = prompt.replace(/```ts\n[\s\S]*?\n```/g, "");
  }
  for (const token of FORBIDDEN_NAME_TOKENS) {
    if (scanned.includes(token)) {
      throw new Error(
        `[helper-name-leak] prompt for ${arm}/${episodeId} contains forbidden token '${token}' OUTSIDE the inlined manifest.`,
      );
    }
  }
  const named = [...scanned.matchAll(DF_LIB_NAMED_RE)];
  if (named.length > 0) {
    const names = named.map((m) => m[1]).join(", ");
    throw new Error(
      `[helper-name-leak] prompt for ${arm}/${episodeId} contains explicit df.lib.<name> reference(s) OUTSIDE the inlined manifest: ${names}`,
    );
  }
}

// --- Substrate setup -------------------------------------------------------

interface SubstrateHandles {
  baseDir: string;
  // The trajectory id → observer promise map. Only present for
  // substrate-on; substrate-off skips observer installation and this
  // field is unused (we still install the snippet runtime so answer.ts
  // can run, but no `onTrajectorySaved` is wired and no helper lands).
  awaitObserve?: (trajectoryId: string) => Promise<void>;
}

async function setupArm(input: {
  arm: Arm;
  outDir: string;
}): Promise<SubstrateHandles> {
  const baseDir = path.join(input.outDir, "datafetch-home");
  // Fresh slate for this arm: wipe any previous run's home so the
  // crystallisation gate fires cleanly across the e1 → e2 → e3 chain.
  await fsp.rm(baseDir, { recursive: true, force: true });
  await fsp.mkdir(path.join(baseDir, "lib", TENANT_ID), { recursive: true });

  if (input.arm === "substrate-off") {
    // Snippet runtime only — needed so we can execute the agent's
    // answer.ts. No observer, no seed; lib/<tenant>/ stays empty.
    await installSnippetRuntime({ baseDir, skipSeedMirror: true });
    return { baseDir };
  }

  // substrate-on: snippet runtime + observer + seed.
  await fsp.mkdir(path.join(baseDir, "lib", "__seed__"), { recursive: true });
  await fsp.writeFile(
    path.join(baseDir, "lib", "__seed__", "per_entity.ts"),
    renderPerEntitySeed(),
    "utf8",
  );
  const { snippetRuntime } = await installSnippetRuntime({
    baseDir,
    skipSeedMirror: true,
  });
  const { observer } = installObserver({
    baseDir,
    tenantId: TENANT_ID,
    snippetRuntime,
  });
  const awaitObserve = async (trajectoryId: string): Promise<void> => {
    const observePromise = observer.observerPromise.get(trajectoryId);
    if (!observePromise) return;
    const deadline = new Promise<void>((resolve) =>
      setTimeout(resolve, OBSERVER_AWAIT_MS),
    );
    await Promise.race([observePromise.then(() => undefined), deadline]);
  };
  return { baseDir, awaitObserve };
}

// --- Claude invocation -----------------------------------------------------

interface AgentRun {
  stdout: string;
  stderr: string;
  exitCode: number;
  elapsedMs: number;
  finalMessage: string;
  usage: {
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
  };
  totalCostUsd: number;
}

function spawnProcess(
  command: string,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv; timeoutMs?: number; input?: string },
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let timedOut = false;
    let closed = false;
    const timer = options.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill("SIGTERM");
          setTimeout(() => {
            if (!closed) child.kill("SIGKILL");
          }, 2_000).unref();
        }, options.timeoutMs)
      : undefined;
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      resolve({
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: `${Buffer.concat(stderr).toString("utf8")}${String(err)}`,
        exitCode: 1,
      });
    });
    child.on("close", (code, signal) => {
      closed = true;
      if (timer) clearTimeout(timer);
      const sBuf = Buffer.concat(stderr).toString("utf8");
      resolve({
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: timedOut
          ? `${sBuf}\n[timed out after ${options.timeoutMs}ms signal=${signal ?? ""}]\n`
          : sBuf,
        exitCode: typeof code === "number" ? code : 1,
      });
    });
    if (options.input !== undefined) {
      child.stdin.end(options.input);
    } else {
      child.stdin.end();
    }
  });
}

async function runClaudeAgent(input: {
  workspaceDir: string;
  prompt: string;
  model: string;
  baseDir: string;
}): Promise<AgentRun> {
  const claudeBin = process.env["CLAUDE_CLI"] ?? "claude-p";
  // claude-p drives the interactive TUI via PTY and is the default per
  // the existing skillcraft harness. It accepts the prompt as either
  // stdin or a positional; we keep behaviour parallel to the skillcraft
  // path (positional prompt) so caching / system-prompt shape matches.
  const isClaudeP = /(?:^|\/)claude-p$/.test(claudeBin);
  const cliArgs = isClaudeP
    ? [
        "--output-format", "json",
        "--model", input.model,
        "--dangerously-skip-permissions",
        "--timeout", String(Math.max(60, Math.ceil(AGENT_TIMEOUT_MS / 1000))),
        input.prompt,
      ]
    : [
        "--print",
        "--output-format", "json",
        "--model", input.model,
        "--dangerously-skip-permissions",
        "--no-session-persistence",
        input.prompt,
      ];

  const started = performance.now();
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DATAFETCH_HOME: input.baseDir,
  };
  const run = await spawnProcess(claudeBin, cliArgs, {
    cwd: input.workspaceDir,
    env,
    timeoutMs: AGENT_TIMEOUT_MS,
  });
  const elapsedMs = performance.now() - started;

  let finalMessage = "";
  const usage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };
  let totalCostUsd = 0;
  try {
    const parsed = JSON.parse(run.stdout) as Record<string, unknown>;
    const result = parsed["result"];
    if (typeof result === "string") {
      finalMessage = result;
    } else if (result !== undefined) {
      finalMessage = JSON.stringify(result);
    }
    const cost = parsed["total_cost_usd"];
    if (typeof cost === "number" && Number.isFinite(cost)) {
      totalCostUsd = cost;
    }
    const rawUsage = parsed["usage"];
    if (rawUsage && typeof rawUsage === "object") {
      const u = rawUsage as Record<string, unknown>;
      usage.inputTokens = numberField(u, "input_tokens");
      usage.cachedInputTokens =
        numberField(u, "cache_read_input_tokens") +
        numberField(u, "cache_creation_input_tokens");
      usage.outputTokens = numberField(u, "output_tokens");
    }
  } catch {
    finalMessage = run.stdout.trim();
  }
  return {
    stdout: run.stdout,
    stderr: run.stderr,
    exitCode: run.exitCode,
    elapsedMs,
    finalMessage,
    usage,
    totalCostUsd,
  };
}

function numberField(record: Record<string, unknown>, key: string): number {
  const v = record[key];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

// --- Episode runner --------------------------------------------------------

interface EpisodeResult {
  id: EpisodeId;
  promptBytes: number;
  agentInputTokens: number;
  agentCachedInputTokens: number;
  agentOutputTokens: number;
  effectiveTokens: number;
  agentElapsedMs: number;
  agentExitCode: number;
  agentTotalCostUsd: number;
  snippetExitCode: number;
  trajectoryPrimitives: string[];
  libCallsInTrajectory: string[];
  answerCorrect: boolean;
  answerExpected: unknown;
  answerGot: unknown;
  crystallisedHelperFiles: string[];
}

async function runEpisode(input: {
  arm: Arm;
  episode: EpisodeSpec;
  outDir: string;
  handles: SubstrateHandles;
  model: string;
  dryRun: boolean;
  manifestInline: boolean;
  workspaceLib: boolean;
  workspaceOverlayDir?: string;
}): Promise<EpisodeResult> {
  const episodeDir = path.join(input.outDir, "episodes", input.episode.id);
  const workspace = path.join(episodeDir, "workspace");
  const agentDir = path.join(episodeDir, "agent");
  await fsp.mkdir(path.join(workspace, "scripts"), { recursive: true });
  await fsp.mkdir(agentDir, { recursive: true });

  // workspace-lib mode: mirror the substrate's lib overlay +
  // workspace-memory contract (AGENTS.md / CLAUDE.md / df.d.ts) into
  // workspace/ so the agent discovers helpers via standard repo
  // exploration (ls, cat, project-memory) instead of via a special
  // discovery channel in the task prompt. Runtime still routes through
  // df.lib.<name> against the substrate's overlay; the mirror is
  // read-only documentation for the agent.
  if (input.workspaceLib && input.arm === "substrate-on") {
    // Regenerate df.d.ts and AGENTS.md BEFORE the mirror so they
    // reflect any preseeded helpers + the current lib state.
    await regenerateManifest({ baseDir: input.handles.baseDir, tenantId: TENANT_ID });
    await regenerateWorkspaceMemory({ baseDir: input.handles.baseDir, tenantId: TENANT_ID });
    await mirrorLibIntoWorkspace({
      baseDir: input.handles.baseDir,
      tenantId: TENANT_ID,
      workspace,
    });
    // Apply optional overlay AFTER the substrate mirror so it can
    // override workspace memory (e.g. a more directive CLAUDE.md).
    if (input.workspaceOverlayDir !== undefined) {
      const entries = await fsp.readdir(input.workspaceOverlayDir, { withFileTypes: true });
      for (const ent of entries) {
        if (!ent.isFile()) continue;
        await fsp.copyFile(
          path.join(input.workspaceOverlayDir, ent.name),
          path.join(workspace, ent.name),
        );
      }
    }
  }

  // Inline-manifest mode: regenerate df.d.ts and read it BEFORE rendering
  // the prompt, so the agent sees the manifest as cached input tokens
  // rather than spending output-token turns on `cat`.
  let inlinedManifest: string | undefined;
  if (input.manifestInline && input.arm === "substrate-on") {
    await regenerateManifest({ baseDir: input.handles.baseDir, tenantId: TENANT_ID });
    try {
      inlinedManifest = await fsp.readFile(
        path.join(input.handles.baseDir, "df.d.ts"),
        "utf8",
      );
    } catch {
      inlinedManifest = "// (no df.d.ts available yet)\n";
    }
  }

  const prompt = renderEpisodePrompt({
    arm: input.arm,
    episode: input.episode,
    manifestInline: input.manifestInline,
    workspaceLib: input.workspaceLib,
    ...(inlinedManifest !== undefined ? { inlinedManifest } : {}),
  });
  assertNoHelperNameLeak(prompt, input.episode.id, input.arm, input.manifestInline);
  await fsp.writeFile(path.join(episodeDir, "prompt.txt"), prompt, "utf8");
  // Mirror to agent/ for parity with the SkillCraft layout.
  await fsp.writeFile(path.join(agentDir, "prompt.txt"), prompt, "utf8");

  const promptBytes = Buffer.byteLength(prompt, "utf8");

  let agent: AgentRun = {
    stdout: "",
    stderr: "[dry-run] Claude invocation skipped",
    exitCode: 0,
    elapsedMs: 0,
    finalMessage: "",
    usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
    totalCostUsd: 0,
  };

  if (!input.dryRun) {
    agent = await runClaudeAgent({
      workspaceDir: workspace,
      prompt,
      model: input.model,
      baseDir: input.handles.baseDir,
    });
    await fsp.writeFile(
      path.join(agentDir, "run.json"),
      JSON.stringify(
        {
          stdout: agent.stdout,
          stderr: agent.stderr,
          exitCode: agent.exitCode,
          elapsedMs: agent.elapsedMs,
          totalCostUsd: agent.totalCostUsd,
          usage: agent.usage,
          finalMessage: agent.finalMessage,
        },
        null,
        2,
      ),
      "utf8",
    );
  } else {
    await fsp.writeFile(
      path.join(agentDir, "run.json"),
      JSON.stringify({ dryRun: true }, null, 2),
      "utf8",
    );
  }

  const effectiveTokens =
    Math.max(0, agent.usage.inputTokens - agent.usage.cachedInputTokens) +
    agent.usage.outputTokens;

  // Default to a "no answer" result; overridden below if answer.ts ran.
  let snippetExitCode = 1;
  let trajectoryPrimitives: string[] = [];
  let libCallsInTrajectory: string[] = [];
  let answerGot: unknown = null;
  let answerCorrect = false;

  const answerPath = path.join(workspace, "scripts", "answer.ts");
  const answerExists = await fileExists(answerPath);
  if (!answerExists) {
    await fsp.writeFile(
      path.join(episodeDir, "snippet-stderr.txt"),
      input.dryRun
        ? "[dry-run] scripts/answer.ts was not written\n"
        : "scripts/answer.ts was not written by the agent\n",
      "utf8",
    );
    await fsp.writeFile(
      path.join(episodeDir, "snippet-result.json"),
      JSON.stringify({ exitCode: 1, reason: "answer-missing" }, null, 2),
      "utf8",
    );
  } else if (input.dryRun) {
    // Dry run with an existing answer.ts is unusual; skip execution.
    await fsp.writeFile(
      path.join(episodeDir, "snippet-stderr.txt"),
      "[dry-run] skipping snippet execution\n",
      "utf8",
    );
    await fsp.writeFile(
      path.join(episodeDir, "snippet-result.json"),
      JSON.stringify({ exitCode: 0, dryRun: true }, null, 2),
      "utf8",
    );
  } else {
    const run = await runAnswerScript({
      handles: input.handles,
      arm: input.arm,
      answerPath,
      episodeDir,
    });
    snippetExitCode = run.exitCode;
    trajectoryPrimitives = run.primitives;
    libCallsInTrajectory = run.libCalls;
    answerGot = run.parsedAnswer;
    answerCorrect = run.parsedAnswer !== undefined
      ? deepEqual(canonicalise(run.parsedAnswer), canonicalise(input.episode.gold))
      : false;
  }

  await fsp.writeFile(
    path.join(episodeDir, "gold-answer-check.json"),
    JSON.stringify(
      {
        expected: input.episode.gold,
        got: answerGot,
        passed: answerCorrect,
      },
      null,
      2,
    ),
    "utf8",
  );

  const crystallisedHelperFiles = await listCrystallisedHelpers(
    input.handles.baseDir,
  );

  return {
    id: input.episode.id,
    promptBytes,
    agentInputTokens: agent.usage.inputTokens,
    agentCachedInputTokens: agent.usage.cachedInputTokens,
    agentOutputTokens: agent.usage.outputTokens,
    effectiveTokens,
    agentElapsedMs: agent.elapsedMs,
    agentExitCode: agent.exitCode,
    agentTotalCostUsd: agent.totalCostUsd,
    snippetExitCode,
    trajectoryPrimitives,
    libCallsInTrajectory,
    answerCorrect,
    answerExpected: input.episode.gold,
    answerGot,
    crystallisedHelperFiles,
  };
}

interface AnswerRun {
  exitCode: number;
  primitives: string[];
  libCalls: string[];
  parsedAnswer: unknown;
}

async function runAnswerScript(input: {
  handles: SubstrateHandles;
  arm: Arm;
  answerPath: string;
  episodeDir: string;
}): Promise<AnswerRun> {
  // Late import: snippet runtime needs the *current* in-process
  // LibraryResolver, which setupArm() configured during installSnippetRuntime().
  const { DiskSnippetRuntime } = await import("../../snippet/runtime.js");
  const runtime = new DiskSnippetRuntime();
  // Re-wire the trajectory-saved callback so the observer crystallises
  // helpers from THIS run too. installSnippetRuntime returned a fresh
  // DiskSnippetRuntime instance; the per-episode runner gets the
  // already-wired one through the observer install. We re-install here
  // for clarity — the installSnippetRuntime mutates module-level state
  // (setLibraryResolver), not per-instance state, so we need to reuse
  // the wired instance. Easiest: ask installObserver to wire THIS
  // instance for substrate-on. For substrate-off, no wiring needed.
  if (input.arm === "substrate-on") {
    const { installObserver: install } = await import("../../observer/install.js");
    const { observer } = install({
      baseDir: input.handles.baseDir,
      tenantId: TENANT_ID,
      snippetRuntime: runtime,
    });
    // Replace the awaitObserve closure with one bound to this fresh
    // observer (the substrateHandles closure was bound to the previous
    // observer instance from setupArm). We mutate via a cast to keep
    // the public type immutable from the caller's perspective.
    (input.handles as { awaitObserve?: (id: string) => Promise<void> }).awaitObserve =
      async (trajectoryId: string): Promise<void> => {
        const p = observer.observerPromise.get(trajectoryId);
        if (!p) return;
        const deadline = new Promise<void>((resolve) =>
          setTimeout(resolve, OBSERVER_AWAIT_MS),
        );
        await Promise.race([p.then(() => undefined), deadline]);
      };
  }

  const rawSource = await fsp.readFile(input.answerPath, "utf8");
  const source = unwrapFireAndForgetIife(rawSource);
  if (source !== rawSource) {
    await fsp.writeFile(
      path.join(input.episodeDir, "prepared-answer.ts"),
      source,
      "utf8",
    );
  }
  const bridge = buildJsonplaceholderBridgeConfig();
  const run = await runtime.run({
    source,
    sourcePath: input.answerPath,
    sessionCtx: {
      tenantId: TENANT_ID,
      mountIds: [],
      baseDir: input.handles.baseDir,
      snippetTimeoutMs: SNIPPET_TIMEOUT_MS,
      toolBridge: bridge,
    },
  });

  await fsp.writeFile(path.join(input.episodeDir, "snippet-stdout.txt"), run.stdout, "utf8");
  await fsp.writeFile(path.join(input.episodeDir, "snippet-stderr.txt"), run.stderr, "utf8");
  await fsp.writeFile(
    path.join(input.episodeDir, "snippet-result.json"),
    JSON.stringify(
      {
        exitCode: run.exitCode,
        trajectoryId: run.trajectoryId,
        cost: run.cost,
        answer: run.answer ?? null,
      },
      null,
      2,
    ),
    "utf8",
  );

  // Substrate-on: wait for the observer to finish authoring before we
  // move on to the next episode (which expects df.d.ts + lib/<tenant>/
  // to reflect this run's crystallisation).
  if (input.arm === "substrate-on" && run.trajectoryId && input.handles.awaitObserve) {
    await input.handles.awaitObserve(run.trajectoryId);
  }

  // Re-generate df.d.ts so the next episode's `cat df.d.ts` shows the
  // freshly learned helper. Cheap and idempotent; safe in both arms.
  await regenerateManifest({ baseDir: input.handles.baseDir, tenantId: TENANT_ID });

  let primitives: string[] = [];
  let libCalls: string[] = [];
  let trajectory: TrajectoryRecord | undefined;
  if (run.trajectoryId) {
    try {
      trajectory = await readTrajectory(run.trajectoryId, input.handles.baseDir);
      primitives = trajectory.calls.map((c) => c.primitive);
      libCalls = primitives.filter((p) => p.startsWith("lib."));
      await fsp.writeFile(
        path.join(input.episodeDir, "trajectory.json"),
        JSON.stringify(trajectory, null, 2),
        "utf8",
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await fsp.writeFile(
        path.join(input.episodeDir, "trajectory-read-error.txt"),
        msg,
        "utf8",
      );
    }
  }

  const parsedAnswer = parseAnswerFromStdout(run.stdout);
  return {
    exitCode: run.exitCode,
    primitives,
    libCalls,
    parsedAnswer,
  };
}

// --- Defensive source transform -------------------------------------------

// Rewrite the agent's fire-and-forget IIFE pattern into top-level statements
// so DiskSnippetRuntime's `export const __df_done = (async () => { <body>
// })();` wrapper actually awaits the work.
//
// Matches the trailing `})();` (with optional `.catch(...)` and trailing
// semicolons / whitespace) and an opening `(async () => {` (or
// `(async function() {`). Whitespace-tolerant; rejects nested IIFEs (only
// touches the OUTER fire-and-forget wrapper).
export function unwrapFireAndForgetIife(source: string): string {
  // Strip a `void` prefix if present: `void (async () => {...})()`.
  let s = source.trimStart().startsWith("void ")
    ? source.replace(/^[\s]*void\s+/, "")
    : source;
  // Match `(async () => {` OR `(async function ...() {` at the start.
  const openRe = /^\s*\(\s*async\s*(?:\(\s*\)\s*=>|function\s*[A-Za-z_$]*\s*\(\s*\))\s*\{\s*/;
  const m = openRe.exec(s);
  if (!m) return source;
  const bodyStart = m[0].length;
  // Match the trailing `}\s*\)\s*(...optional `.catch(...)`...)\s*;?\s*$`.
  const closeRe = /\}\s*\)\s*\(\s*\)(?:\s*\.\s*catch\s*\([^)]*\))?\s*;?\s*$/;
  const cm = closeRe.exec(s);
  if (!cm) return source;
  const bodyEnd = cm.index;
  if (bodyEnd <= bodyStart) return source;
  const inner = s.slice(bodyStart, bodyEnd);
  // Light dedent: drop one level of leading two-space indent on each line.
  const dedented = inner
    .split("\n")
    .map((ln) => (ln.startsWith("  ") ? ln.slice(2) : ln))
    .join("\n");
  return dedented;
}

// --- Gold-answer parsing ---------------------------------------------------

// Pull the last JSON-looking line out of stdout. The agent's answer.ts
// is instructed to end with `console.log(JSON.stringify(answer))`, so
// the last line containing a balanced `{...}` or `[...]` is the answer.
function parseAnswerFromStdout(stdout: string): unknown {
  const lines = stdout.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i] ?? "";
    if (!(line.startsWith("{") || line.startsWith("["))) continue;
    try {
      return JSON.parse(line);
    } catch {
      continue;
    }
  }
  return undefined;
}

// Canonicalise an object/array tree for deep comparison: arrays of
// objects with an `id` field get sorted by id ascending; plain
// arrays stay in-order. This handles e2 where the agent might return
// users in any order.
function canonicalise(value: unknown): unknown {
  if (Array.isArray(value)) {
    const items = value.map(canonicalise);
    // Detect arrays of objects with stable scalar `id`s and sort.
    if (
      items.length > 0 &&
      items.every(
        (v) =>
          v !== null &&
          typeof v === "object" &&
          !Array.isArray(v) &&
          "id" in (v as Record<string, unknown>) &&
          ["string", "number"].includes(typeof (v as Record<string, unknown>)["id"]),
      )
    ) {
      items.sort((a, b) => {
        const ai = (a as Record<string, unknown>)["id"];
        const bi = (b as Record<string, unknown>)["id"];
        return String(ai).localeCompare(String(bi));
      });
    }
    return items;
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = canonicalise((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (typeof a === "object" && typeof b === "object") {
    const aKeys = Object.keys(a as Record<string, unknown>);
    const bKeys = Object.keys(b as Record<string, unknown>);
    if (aKeys.length !== bKeys.length) return false;
    for (const k of aKeys) {
      if (!deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) {
        return false;
      }
    }
    return true;
  }
  return false;
}

// --- Utilities -------------------------------------------------------------

async function fileExists(p: string): Promise<boolean> {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}

async function mirrorLibIntoWorkspace(input: {
  baseDir: string;
  tenantId: string;
  workspace: string;
}): Promise<void> {
  const targetLib = path.join(input.workspace, "lib");
  await fsp.mkdir(targetLib, { recursive: true });
  const sources = [
    { src: path.join(input.baseDir, "lib", "__seed__"), dst: path.join(targetLib, "__seed__") },
    { src: path.join(input.baseDir, "lib", input.tenantId), dst: path.join(targetLib, input.tenantId) },
  ];
  for (const { src, dst } of sources) {
    try {
      await fsp.access(src);
    } catch {
      continue;
    }
    await fsp.mkdir(dst, { recursive: true });
    const entries = await fsp.readdir(src, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isFile() || !ent.name.endsWith(".ts")) continue;
      await fsp.copyFile(path.join(src, ent.name), path.join(dst, ent.name));
    }
  }
  // Also mirror the substrate's workspace-memory contract (AGENTS.md +
  // df.d.ts) into the workspace. claude-p reads CLAUDE.md from cwd as
  // project memory; the substrate's AGENTS.md is the "First Reads"
  // convention that tells the agent to consult df.d.ts and df.lib.*
  // before writing primitives. This is the skill-progressive-disclosure
  // pattern: the framework-level convention lives in the workspace, not
  // in the per-task prompt.
  for (const fname of ["AGENTS.md", "df.d.ts"]) {
    const src = path.join(input.baseDir, fname);
    try {
      await fsp.access(src);
    } catch {
      continue;
    }
    await fsp.copyFile(src, path.join(input.workspace, fname));
  }
  // CLAUDE.md is a symlink to AGENTS.md in the substrate. Recreate it as
  // a real file copy so claude-p picks it up regardless of symlink
  // resolution policy.
  const agentsDst = path.join(input.workspace, "AGENTS.md");
  try {
    await fsp.access(agentsDst);
    await fsp.copyFile(agentsDst, path.join(input.workspace, "CLAUDE.md"));
  } catch {
    // no AGENTS.md to mirror; skip
  }
}

async function listCrystallisedHelpers(baseDir: string): Promise<string[]> {
  const dir = path.join(baseDir, "lib", TENANT_ID);
  try {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith(".ts"))
      .map((e) => path.join("lib", TENANT_ID, e.name))
      .sort();
  } catch {
    return [];
  }
}

// --- Main ------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  await fsp.mkdir(args.outDir, { recursive: true });

  const handles = await setupArm({ arm: args.arm, outDir: args.outDir });

  // Preseed hand-authored helpers into the tenant overlay AFTER
  // setupArm has wiped baseDir. These behave as if a prior episode
  // had crystallised them; the resolver picks them up via the same
  // DiskLibraryResolver lookup as auto-authored helpers.
  if (args.preseedHelpersDir !== undefined && args.arm === "substrate-on") {
    const tenantLibDir = path.join(handles.baseDir, "lib", TENANT_ID);
    await fsp.mkdir(tenantLibDir, { recursive: true });
    const entries = await fsp.readdir(args.preseedHelpersDir, { withFileTypes: true });
    let copied = 0;
    for (const ent of entries) {
      if (!ent.isFile() || !ent.name.endsWith(".ts")) continue;
      await fsp.copyFile(
        path.join(args.preseedHelpersDir, ent.name),
        path.join(tenantLibDir, ent.name),
      );
      copied += 1;
    }
    // eslint-disable-next-line no-console
    console.log(
      `[productflow] preseeded ${copied} helper(s) from ${args.preseedHelpersDir} into lib/${TENANT_ID}/`,
    );
  }

  const model = process.env["DF_TEST_MODEL"] ?? DEFAULT_MODEL;
  const episodes = args.task
    ? EPISODES.filter((e) => e.id === args.task)
    : EPISODES;

  await fsp.writeFile(
    path.join(args.outDir, "run-info.json"),
    JSON.stringify(
      {
        arm: args.arm,
        manifestInline: args.manifestInline,
        workspaceLib: args.workspaceLib,
        model,
        convergenceN: CONVERGENCE_N,
        tenantId: TENANT_ID,
        jsonplaceholderRunnerPath: buildJsonplaceholderBridgeConfig().runnerPath,
        generatedAt: new Date().toISOString(),
        dryRun: args.dryRun,
        taskFilter: args.task ?? null,
      },
      null,
      2,
    ),
    "utf8",
  );

  const episodeResults: EpisodeResult[] = [];
  for (const episode of episodes) {
    // eslint-disable-next-line no-console
    console.log(`[productflow] arm=${args.arm} episode=${episode.id} starting`);
    const result = await runEpisode({
      arm: args.arm,
      episode,
      outDir: args.outDir,
      handles,
      model,
      dryRun: args.dryRun,
      manifestInline: args.manifestInline,
      workspaceLib: args.workspaceLib,
      ...(args.workspaceOverlayDir !== undefined
        ? { workspaceOverlayDir: args.workspaceOverlayDir }
        : {}),
    });
    episodeResults.push(result);
    // eslint-disable-next-line no-console
    console.log(
      `[productflow] arm=${args.arm} episode=${episode.id} done ` +
        `correct=${result.answerCorrect} effTokens=${result.effectiveTokens} ` +
        `helpers=${result.crystallisedHelperFiles.length}`,
    );

    // Warn-not-fail: substrate-on / e1 should normally crystallise ≥1
    // helper. If zero land, log it so the operator notices; we don't
    // throw because gate firing depends on agent behaviour we don't
    // control here.
    if (
      args.arm === "substrate-on" &&
      episode.id === "e1" &&
      !args.dryRun &&
      result.crystallisedHelperFiles.length === 0
    ) {
      // eslint-disable-next-line no-console
      console.warn(
        "[productflow] WARN substrate-on e1 produced zero crystallised helpers under lib/" +
          TENANT_ID +
          "/. e2/e3 will have nothing to reuse.",
      );
    }
  }

  await fsp.writeFile(
    path.join(args.outDir, "results.json"),
    JSON.stringify(
      {
        arm: args.arm,
        model,
        convergenceN: CONVERGENCE_N,
        tenantId: TENANT_ID,
        episodes: episodeResults,
      },
      null,
      2,
    ),
    "utf8",
  );

  // eslint-disable-next-line no-console
  console.log(`[productflow] wrote ${path.join(args.outDir, "results.json")}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
