# Learned Interfaces

Existing helpers in this family:
- none yet

New helpers should be TypeScript files in this directory. The file name must match the exported function name.
Use `fn({...})` so Datafetch can validate and reuse the helper in later tasks.
Do not rely on a newly authored helper from the current scripts/answer.ts unless it was already listed in ../df.d.ts at episode start.
Available exact tool names for this task: local-pokemon_get_details, local-pokemon_get_species, local-pokemon_get_evolution, local-pokemon_get_moves, local-pokemon_get_abilities.
Use only these exact names when calling `df.tool`; metadata in `task_config.json` can mention higher-level tool concepts that are not callable endpoints.
Prefer generic inputs like `{ arg, toolNames }` when that still lets the caller shape the output for the current task.
Make the `input` schema match the exact object your answer script passes. If the helper accepts nested, family-specific inputs, use `v.unknown()` or a broad object schema rather than rejecting valid caller data.

Minimal pattern:
```ts
// @shape-hash: 00000000
import { fn } from "@datafetch/sdk";
import * as v from "valibot";

export const helperName = fn({
  intent: "Reusable SkillCraft family workflow.",
  examples: [],
  input: v.object({
    arg: v.unknown(),
    toolNames: v.array(v.string()),
  }),
  output: v.unknown(),
  async body(input) {
    const tools = (globalThis as any).df.tool.pokemon_tools;
    const outputs: Record<string, unknown> = {};
    for (const toolName of input.toolNames) {
      const localName = toolName.startsWith("local-") ? toolName : `local-${toolName}`;
      outputs[toolName] = await tools[localName](input.arg);
    }
    return outputs;
  },
});
```
