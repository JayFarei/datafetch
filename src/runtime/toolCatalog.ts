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

// Render the tool bridge as part of the TypeScript code-mode surface.
// Dataset evals can still write tool_manifest.json as a fallback, but df.d.ts
// should be the primary discovery contract for agents.
export function renderToolCatalogDtsLines(
  catalog: ToolCatalogEntry[],
  indent = "  ",
): string[] {
  if (catalog.length === 0) return [];
  const lines: string[] = [];
  lines.push(`${indent}/** Governed external tool bridge. */`);
  lines.push(`${indent}tool: {`);
  for (const entry of catalog) {
    lines.push(`${indent}  /** Tool bundle ${entry.bundle}. */`);
    lines.push(`${indent}  ${quoteProperty(entry.bundle)}: {`);
    lines.push(`${indent}    [name: string]: (input: unknown) => Promise<unknown>;`);
    for (const tool of entry.tools) {
      lines.push(...renderToolDescriptorDtsLines(tool, `${indent}    `));
    }
    lines.push(`${indent}  };`);
  }
  lines.push(`${indent}};`);
  return lines;
}

function renderToolDescriptorDtsLines(
  tool: ToolDescriptor,
  indent: string,
): string[] {
  const lines: string[] = [];
  const description = compactDescription(tool.description);
  if (description) {
    lines.push(`${indent}/**`);
    for (const line of description.split("\n")) {
      lines.push(`${indent} * ${escapeJSDoc(line)}`);
    }
    lines.push(`${indent} */`);
  }
  lines.push(
    `${indent}${quoteProperty(tool.name)}: (input: ${jsonSchemaToTs(tool.params_json_schema)}) => Promise<unknown>;`,
  );
  return lines;
}

export function jsonSchemaToTs(schema: Record<string, unknown>): string {
  const props = schema.properties && typeof schema.properties === "object"
    ? schema.properties as Record<string, Record<string, unknown>>
    : {};
  const required = new Set(
    Array.isArray(schema.required)
      ? schema.required.filter((item): item is string => typeof item === "string")
      : [],
  );
  const fields = Object.entries(props).map(([name, prop]) => {
    const optional = required.has(name) ? "" : "?";
    return `${quoteProperty(name)}${optional}: ${jsonSchemaPropertyToTs(prop)}`;
  });
  return fields.length ? `{ ${fields.join("; ")} }` : "Record<string, unknown>";
}

function jsonSchemaPropertyToTs(prop: Record<string, unknown>): string {
  if (Array.isArray(prop.type)) {
    return prop.type.map((t) => jsonSchemaTypeName(t)).join(" | ");
  }
  return jsonSchemaTypeName(prop.type);
}

function jsonSchemaTypeName(type: unknown): string {
  switch (type) {
    case "number":
    case "integer":
      return "number";
    case "boolean":
      return "boolean";
    case "array":
      return "unknown[]";
    case "object":
      return "Record<string, unknown>";
    case "string":
      return "string";
    case "null":
      return "null";
    default:
      return "unknown";
  }
}

function compactDescription(description: string): string {
  return description
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line, index, lines) => {
      if (line.length > 0) return true;
      return index > 0 && index < lines.length - 1 && lines[index - 1] !== "";
    })
    .slice(0, 40)
    .join("\n");
}

function quoteProperty(name: string): string {
  return JSON.stringify(name);
}

function escapeJSDoc(value: string): string {
  return value.replace(/\*\//g, "* /");
}
