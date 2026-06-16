import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const helpers = [
  { name: "traceScan", params: "window, project, model, skill, committed" },
  { name: "eventScan", params: "types, window, traceId" },
  { name: "contextNodes", params: "traceId, stepIndex" },
  { name: "spendBy", params: "groupBy, window, project, model" },
  { name: "wasteTop", params: "n, window, project, model" },
  { name: "sessionsWhere", params: "window, project, model, skill, committed, cacheBelow, maxSteps" },
  { name: "skillReport", params: "skill, window, project, model" },
  { name: "shareReport", params: "project, window" },
  { name: "syncBlockers", params: "project, window" },
  { name: "blame", params: "commitSha" },
  { name: "fileEffort", params: "glob, window" },
  { name: "patchSurvival", params: "window" },
];

const sourcePath = fileURLToPath(new URL("./index.ts", import.meta.url));
const source = await readFile(sourcePath, "utf8");
const lines = source.split("\n");

function lineCount(name: string): number {
  const start = lines.findIndex((line) => line.includes(`function ${name}`));
  if (start === -1) return 0;
  let depth = 0;
  let seenBody = false;
  for (let index = start; index < lines.length; index += 1) {
    for (const char of lines[index] ?? "") {
      if (char === "{") {
        depth += 1;
        seenBody = true;
      }
      if (char === "}") depth -= 1;
    }
    if (seenBody && depth === 0) return index - start + 1;
  }
  return 0;
}

console.log("| name | params | line_count |");
console.log("| --- | --- | ---: |");
for (const helper of helpers) {
  console.log(`| ${helper.name} | ${helper.params} | ${lineCount(helper.name)} |`);
}
