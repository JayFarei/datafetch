/**
 * jsonplaceholder tool surface.
 *
 * The substrate's snippet runtime exposes `df.tool.<bundle>.<name>(input)`
 * calls via the Python tool bridge in `src/snippet/dfBinding.ts`. That bridge
 * spawns `${python} ${runnerPath} --dataset-dir X --bundle Y --tool Z --args
 * JSON` and parses `{result: ...}` from stdout. The substrate does not care
 * what language the runner is, so we plug a jsonplaceholder runner (written
 * in Python stdlib) into that exact bridge interface.
 *
 * This module exposes the constants + a `buildJsonplaceholderBridgeConfig()`
 * helper returning the precise object shape `sessionCtx.toolBridge` expects.
 */

import { fileURLToPath } from "node:url";
import * as path from "node:path";

import type { ToolCatalogEntry } from "../../runtime/toolCatalog.js";

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
  datasetDir: string;
  bundles: string[];
  runnerPath: string;
  python: string;
  toolTimeoutMs: number;
};

/**
 * Returns the exact object shape `dfBinding.ts` expects for
 * `sessionCtx.toolBridge`. `datasetDir` is unused by our jsonplaceholder
 * runner (it queries a live HTTP endpoint, not a local dataset), so we pass
 * `process.cwd()` as an inert placeholder.
 */
export function buildJsonplaceholderBridgeConfig(): JsonplaceholderBridgeConfig {
  return {
    datasetDir: process.cwd(),
    bundles: [JSONPLACEHOLDER_BUNDLE_NAME],
    runnerPath: JSONPLACEHOLDER_RUNNER_PATH,
    python: "python3",
    toolTimeoutMs: 8000,
  };
}

export function jsonplaceholderToolCatalog(): ToolCatalogEntry[] {
  return [
    {
      bundle: JSONPLACEHOLDER_BUNDLE_NAME,
      tools: [
        {
          name: "getUsers",
          description:
            "Fetch every JSONPlaceholder user. Returns { success, users: Array<User> }.",
          params_json_schema: { type: "object", properties: {}, required: [] },
        },
        {
          name: "getUser",
          description:
            "Fetch one JSONPlaceholder user by numeric user id. Returns { success, user: User }.",
          params_json_schema: {
            type: "object",
            properties: { id: { type: "number" } },
            required: ["id"],
          },
        },
        {
          name: "getPosts",
          description:
            "Fetch every JSONPlaceholder post. Returns { success, posts: Array<Post> }.",
          params_json_schema: { type: "object", properties: {}, required: [] },
        },
        {
          name: "getPostsByUser",
          description:
            "Fetch JSONPlaceholder posts authored by one user id. Returns { success, posts: Array<Post> }.",
          params_json_schema: {
            type: "object",
            properties: { userId: { type: "number" } },
            required: ["userId"],
          },
        },
        {
          name: "getCommentsByPost",
          description:
            "Fetch JSONPlaceholder comments for one post id. Returns { success, comments: Array<Comment> }.",
          params_json_schema: {
            type: "object",
            properties: { postId: { type: "number" } },
            required: ["postId"],
          },
        },
      ],
    },
  ];
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
