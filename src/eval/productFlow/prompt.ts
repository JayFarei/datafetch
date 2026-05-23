import {
  JSONPLACEHOLDER_BUNDLE_NAME,
  JSONPLACEHOLDER_TOOLS,
} from "./jsonplaceholderTools.js";

export type ProductFlowArm = "substrate-on" | "substrate-off";
export type ProductFlowEpisodeId = "e1" | "e2" | "e3" | "e4";

export interface ProductFlowEpisodeSpec {
  id: ProductFlowEpisodeId;
  question: string;
  gold: unknown;
}

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

export function renderEpisodePrompt(input: {
  arm: ProductFlowArm;
  episode: ProductFlowEpisodeSpec;
  manifestInline: boolean;
  workspaceLib: boolean;
  inlinedManifest?: string;
}): string {
  const sections: string[] = [];
  sections.push("# Task");
  sections.push("");
  sections.push(
    input.workspaceLib
      ? renderCodeModeTaskQuestion(input.episode.question)
      : input.episode.question,
  );
  sections.push("");
  sections.push(
    input.workspaceLib
      ? renderWorkspaceSection({ codeModeSurface: true }) + renderWorkspaceLibPointer()
      : renderWorkspaceSection({ codeModeSurface: false }),
  );
  if (!input.workspaceLib) {
    sections.push("");
    sections.push(renderToolBundlesSection());
    sections.push("");
    sections.push(renderSubstratePrimitivesSection());
  }
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

export function renderCodeModeTaskQuestion(question: string): string {
  return question
    .replace(
      /and write `scripts\/answer\.ts` so that running it prints exactly /i,
      'and return through `df.answer({ status: "answered", value })` a value exactly matching ',
    )
    .replace(
      /and write `scripts\/answer\.ts` so that running it prints a JSON array with /i,
      'and return through `df.answer({ status: "answered", value })` a JSON-compatible array with ',
    )
    .replace(
      /Write `scripts\/answer\.ts` so that running it prints a JSON array of /i,
      'Return through `df.answer({ status: "answered", value })` a JSON-compatible array of ',
    );
}

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
    "- `df.tool.<bundle>.<name>(input) -> { success, ...payload }` - call a registered tool.",
    "- `df.lib.<helperName>(input) -> { value, ...meta }` - call a learned/seed helper. Unwrap with `(await df.lib.<helperName>(input)).value`.",
    "- `df.answer(value)` - return the final answer envelope; useful when running inside the substrate runner.",
  ].join("\n");
}

function renderWorkspaceLibPointer(): string {
  return [
    "",
    "Your workspace contains `AGENTS.md`, `df.d.ts`, and `lib/`. Use them as the callable catalogue.",
    "Before writing `scripts/answer.ts`, inspect `df.d.ts` and `lib/` for matching `df.lib` declarations.",
    "If a learned library declaration matches a repeated entity/tool fan-out, call that library function with the full input shape shown in `df.d.ts` instead of writing a raw `df.tool` loop.",
    "Only fall back to tool primitives when no callable learned library function matches; read helper source when its row shape is unclear.",
  ].join("\n");
}

function renderWorkspaceSection(input: { codeModeSurface: boolean }): string {
  const lines = [
    "# Workspace",
    "",
    input.codeModeSurface
      ? "Write your solution to `scripts/answer.ts`. The file must be a self-contained TypeScript module that uses `df.*` and returns `df.answer(...)`. The harness runs your file directly; do not invoke it yourself."
      : "Write your solution to `scripts/answer.ts`. The file must be a self-contained TypeScript module that uses `df.*` and ends by printing the answer JSON on stdout. The harness runs your file directly; do not invoke it yourself.",
    "",
    "**IMPORTANT - your file MUST use top-level `await`.** Do NOT wrap your work in a fire-and-forget IIFE like `(async () => { ... })();` - the inner awaits will not run inside the harness's snippet runtime.",
    "",
  ];
  if (input.codeModeSurface) {
    lines.push(
      "Use the TypeScript declarations in `df.d.ts` as the source of truth for callable names and shapes.",
      "Treat any task wording about printing JSON as the desired final value, then return that value through `df.answer(...)`.",
      "",
      "Top-level-await shape:",
      "",
      "```ts",
      "// scripts/answer.ts",
      "// Read df.d.ts, compose df.* calls, then return the typed answer envelope.",
      "return df.answer({",
      '  status: "answered",',
      "  value: [/* your answer */],",
      "  evidence: [{ ref: \"df.d.ts\" }],",
      "  derivation: { operation: \"composed with df.* calls\" },",
      "});",
      "```",
    );
    return lines.join("\n");
  }

  lines.push(
    "Skeleton - use top-level statements directly:",
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
  );
  return lines.join("\n");
}

function renderLearnedInterfacesSection(): string {
  return [
    "# Learned interfaces - MANDATORY pre-flight check",
    "",
    "Prior episodes in this workspace may have crystallised reusable helpers under `$DATAFETCH_HOME/lib/<tenant>/`. Calling one when its intent matches is strictly cheaper than calling raw tool primitives, because the substrate records ONE trajectory step for a `df.lib.*` call regardless of how many internal tool calls it makes.",
    "",
    "**Step 1 - BEFORE writing answer.ts, you MUST run this Bash command and read the output:**",
    "",
    "```bash",
    "cat \"$DATAFETCH_HOME/df.d.ts\"",
    "```",
    "",
    "It is a TypeScript declaration file listing every callable `df.lib.*` and `df.tool.*` with JSDoc describing intent, input schema, and a usage example.",
    "",
    "**Step 2 - decide:**",
    "",
    "- If any `df.lib.<name>` entry's JSDoc intent matches your task (e.g. a helper described as `\"repeated tool fan-out\"` or `\"per-entity tool call\"` matches a task that fetches multiple entities by id with the same tool), you MUST call THAT helper instead of looping raw tool calls. Look at its JSDoc example for input shape.",
    "- If no `df.lib.<name>` matches, use the tool primitives directly.",
    "",
    "**Step 3 - when reusing a `df.lib.<name>` helper, ALWAYS inspect its source first** to learn its exact OUTPUT shape (the manifest only shows `Promise<Result<unknown>>` for the return). The source lives at one of these paths:",
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

function renderInlinedManifestSection(manifestText: string): string {
  return [
    "# Learned interfaces - manifest inlined",
    "",
    "The substrate's TypeScript manifest of every callable `df.lib.*` and `df.tool.*` for this workspace is reproduced below. Read it once; do not `cat` it again. If any `df.lib.<name>` entry's JSDoc intent matches your task (e.g. `\"repeated tool fan-out\"` matches multi-id fetches), call THAT helper instead of looping raw tool calls. If no entry matches, use the tool primitives directly. Do NOT invent helper names - only call names you see below.",
    "",
    "```ts",
    manifestText.trimEnd(),
    "```",
    "",
    "Note: the manifest declares helper return types as `Promise<Result<unknown>>`. If you decide to call a `df.lib.<name>` whose output shape isn't obvious from the JSDoc example, you MAY `cat \"$DATAFETCH_HOME/lib/__seed__/<name>.ts\"` (seed helpers) or `cat \"$DATAFETCH_HOME/lib/<tenant>/<name>.ts\"` (learned helpers) to inspect the function body's exact return shape - but only AFTER you've decided to use it. Don't browse the catalogue twice.",
  ].join("\n");
}

const DF_LIB_NAMED_RE = /\bdf\.lib\.([A-Za-z_][A-Za-z0-9_]*)\b/g;
const FORBIDDEN_NAME_TOKENS: readonly string[] = ["per_entity", "learnedHelper"];

export function assertNoHelperNameLeak(
  prompt: string,
  episodeId: ProductFlowEpisodeId,
  arm: ProductFlowArm,
  manifestInline: boolean,
): void {
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
