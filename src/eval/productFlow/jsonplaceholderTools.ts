/**
 * jsonplaceholder tool surface.
 *
 * The substrate's snippet runtime exposes `df.tool.<bundle>.<name>(input)`
 * calls via the SkillCraft Python bridge in `src/snippet/dfBinding.ts`. That
 * bridge spawns `${python} ${runnerPath} --skillcraft-dir X --bundle Y --tool
 * Z --args JSON` and parses `{result: ...}` from stdout. The substrate does
 * not care what language the runner is, so we plug a jsonplaceholder runner
 * (written in Python stdlib) into that exact bridge interface.
 *
 * This module exposes the constants + a `buildJsonplaceholderBridgeConfig()`
 * helper returning the precise object shape `sessionCtx.skillcraftToolBridge`
 * expects.
 */

import { fileURLToPath } from "node:url";
import * as path from "node:path";

export const JSONPLACEHOLDER_BASE = "https://jsonplaceholder.typicode.com";

export const JSONPLACEHOLDER_BUNDLE_NAME = "jsonplaceholder";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// `src/eval/productFlow/jsonplaceholderTools.ts` -> repo root is three levels up.
// From repo root, the runner lives at `eval/productFlow/jsonplaceholderToolRunner.py`.
export const JSONPLACEHOLDER_RUNNER_PATH: string = path.resolve(
  HERE,
  "..",
  "..",
  "..",
  "eval",
  "productFlow",
  "jsonplaceholderToolRunner.py",
);

export const JSONPLACEHOLDER_TOOLS: readonly string[] = [
  "getUsers",
  "getUser",
  "getPosts",
  "getPostsByUser",
  "getCommentsByPost",
] as const;

export type JsonplaceholderToolName = (typeof JSONPLACEHOLDER_TOOLS)[number];

export type JsonplaceholderBridgeConfig = {
  skillcraftDir: string;
  bundles: string[];
  runnerPath: string;
  python: string;
  toolTimeoutMs: number;
};

/**
 * Returns the exact object shape `dfBinding.ts` expects for
 * `sessionCtx.skillcraftToolBridge`. `skillcraftDir` is unused by our runner
 * but the substrate's type requires it, so we pass `process.cwd()` as an
 * inert placeholder.
 */
export function buildJsonplaceholderBridgeConfig(): JsonplaceholderBridgeConfig {
  return {
    skillcraftDir: process.cwd(),
    bundles: [JSONPLACEHOLDER_BUNDLE_NAME],
    runnerPath: JSONPLACEHOLDER_RUNNER_PATH,
    python: "python3",
    toolTimeoutMs: 8000,
  };
}

/**
 * Tool -> success envelope key. Useful for verifying that the runner's
 * `{success: true, <key>: data}` envelope matches expectations.
 */
export function expectedResponseKey(tool: string): string {
  switch (tool) {
    case "getUsers":
      return "users";
    case "getUser":
      return "user";
    case "getPosts":
      return "posts";
    case "getPostsByUser":
      return "posts";
    case "getCommentsByPost":
      return "comments";
    default:
      throw new Error(`expectedResponseKey: unknown tool '${tool}'`);
  }
}
