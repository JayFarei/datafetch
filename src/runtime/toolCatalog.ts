// Tool catalog shapes shared across dataset evals.
//
// A dataset eval exposes tools to the agent via two surfaces:
//
//   1. `df.tool.<bundle>.<tool>(input)` — resolved at runtime by the
//      substrate's tool bridge (src/snippet/dfBinding.ts) which shells
//      out to the dataset's runner script.
//
//   2. `tool_manifest.json` written into the episode workspace — a
//      last-resort schema reference the agent can read with `cat`.
//      Primary discovery should go through df.d.ts, which is generated
//      from the same ToolCatalogEntry[] array.
//
// JSON schema of tool_manifest.json (when written by writeToolManifest):
//
//   [
//     {
//       "bundle": string,
//       "tools": [
//         {
//           "name": string,
//           "description": string,
//           "params_json_schema": object   // JSON Schema for tool input
//         }
//       ]
//     }
//   ]
//
// Each dataset eval owns its catalog assembly (typically by introspecting
// its runner script) but writes through the standard shape so the agent
// surface is identical across datasets.

import { promises as fsp } from "node:fs";
import path from "node:path";

export interface ToolDescriptor {
  name: string;
  description: string;
  params_json_schema: Record<string, unknown>;
}

export interface ToolCatalogEntry {
  bundle: string;
  tools: ToolDescriptor[];
}

export const TOOL_MANIFEST_FILENAME = "tool_manifest.json";

// Writes the canonical `tool_manifest.json` into `workspace`. Use this
// from each dataset eval's workspace-prep path so the file name and
// JSON shape stay consistent across evals.
export async function writeToolManifest(
  workspace: string,
  catalog: ToolCatalogEntry[],
): Promise<void> {
  await fsp.writeFile(
    path.join(workspace, TOOL_MANIFEST_FILENAME),
    `${JSON.stringify(catalog, null, 2)}\n`,
  );
}

// Convenience: flatten a catalog into the bare list of tool names. Useful
// for prompt rendering ("Available tools: ..."), bundle inspection, etc.
export function flattenToolCatalogNames(catalog: ToolCatalogEntry[]): string[] {
  return catalog.flatMap((entry) => entry.tools.map((tool) => tool.name));
}
