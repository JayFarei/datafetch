import { promises as fsp } from "node:fs";
import path from "node:path";

import { answerValue, gradeAnswer, loadTemplateSpecs } from "./opentraces_grader_v2.js";

const ROOT = path.resolve("eval/opentraces");
const PACK_PATH = path.join(ROOT, "questions", "pack.jsonl");
const PACK_YAML = path.join(ROOT, "templates", "pack.yaml");
const OLD_PILOT = path.join(ROOT, "probes", "mb2-pilot");
const OUT_DIR = path.join(ROOT, "probes", "mb2b-grader");

type PackRow = {
  row_id: string;
  template_id: string;
  answer_type: string;
  gold: unknown;
};

type Fixture = {
  rowId: string;
  arm: string;
  expected: boolean | null;
  actual: boolean | null;
  reason: string;
};

const PILOT_FIXTURES = [
  { rowId: "otc-0001", pilot: "easy-envelope-aggregate", arm: "armN", expected: false },
  { rowId: "otc-0001", pilot: "easy-envelope-aggregate", arm: "armR", expected: true },
  { rowId: "otc-0001", pilot: "easy-envelope-aggregate", arm: "armL", expected: false },
  { rowId: "otc-0009", pilot: "set-filter", arm: "armN", expected: false },
  { rowId: "otc-0009", pilot: "set-filter", arm: "armR", expected: true },
  { rowId: "otc-0009", pilot: "set-filter", arm: "armL", expected: false },
  { rowId: "otc-0153", pilot: "event-join", arm: "armN", expected: null },
  { rowId: "otc-0153", pilot: "event-join", arm: "armR", expected: null },
  { rowId: "otc-0153", pilot: "event-join", arm: "armL", expected: false },
] as const;

const WRONG_CASES = [
  {
    name: "wrong aggregate token",
    rowId: "otc-0001",
    actual: {
      "openai/gpt-5.5": { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, sessionCount: 253 },
      "anthropic/claude-opus-4-7": { inputTokens: 306966, outputTokens: 9605160, cacheReadTokens: 2492755953, cacheWriteTokens: 67579684, sessionCount: 73 },
      "<synthetic>": { inputTokens: 120, outputTokens: 7428, cacheReadTokens: 698367, cacheWriteTokens: 464349, sessionCount: 9 },
    },
  },
  { name: "wrong empty set", rowId: "otc-0009", actual: ["not-a-real-captured-run"] },
  { name: "wrong exact trace", rowId: "otc-0153", actual: { traceId: "00000000-0000-0000-0000-000000000000" } },
] as const;

const EXTRA_CASES = [
  { name: "exact trace string positive", rowId: "otc-0153", actual: "66733cf8-9003-4f09-bca8-e4cda7030188", expected: true },
] as const;

async function loadPackRows(): Promise<Map<string, PackRow>> {
  const rows = new Map<string, PackRow>();
  for (const line of (await fsp.readFile(PACK_PATH, "utf8")).split("\n")) {
    if (!line.trim()) continue;
    const row = JSON.parse(line) as PackRow;
    rows.set(row.row_id, row);
  }
  return rows;
}

async function readPilotAnswer(pilot: string, arm: string): Promise<unknown> {
  const file = path.join(OLD_PILOT, "episodes", pilot, arm, "snippet-result.json");
  return answerValue(JSON.parse(await fsp.readFile(file, "utf8")) as unknown);
}

async function main(): Promise<void> {
  const specs = await loadTemplateSpecs(PACK_YAML);
  const rows = await loadPackRows();
  const fixtures: Fixture[] = [];
  for (const fixture of PILOT_FIXTURES) {
    const row = rows.get(fixture.rowId);
    if (!row) throw new Error(`missing pack row ${fixture.rowId}`);
    const result = gradeAnswer({
      templateId: row.template_id,
      answerType: row.answer_type,
      gold: row.gold,
      actual: await readPilotAnswer(fixture.pilot, fixture.arm),
      specs,
    });
    fixtures.push({ rowId: fixture.rowId, arm: fixture.arm, expected: fixture.expected, actual: result.correct, reason: result.reason });
  }

  const wrongRows: Fixture[] = [];
  for (const item of WRONG_CASES) {
    const row = rows.get(item.rowId);
    if (!row) throw new Error(`missing pack row ${item.rowId}`);
    const result = gradeAnswer({
      templateId: row.template_id,
      answerType: row.answer_type,
      gold: row.gold,
      actual: item.actual,
      specs,
    });
    wrongRows.push({ rowId: item.rowId, arm: item.name, expected: false, actual: result.correct, reason: result.reason });
  }

  const extraRows: Fixture[] = [];
  for (const item of EXTRA_CASES) {
    const row = rows.get(item.rowId);
    if (!row) throw new Error(`missing pack row ${item.rowId}`);
    const result = gradeAnswer({
      templateId: row.template_id,
      answerType: row.answer_type,
      gold: row.gold,
      actual: item.actual,
      specs,
    });
    extraRows.push({ rowId: item.rowId, arm: item.name, expected: item.expected, actual: result.correct, reason: result.reason });
  }

  const failures = [...fixtures, ...wrongRows, ...extraRows].filter((row) => row.expected !== row.actual);
  await fsp.mkdir(OUT_DIR, { recursive: true });
  await fsp.writeFile(path.join(OUT_DIR, "fixture-outcomes.md"), renderTable(fixtures, wrongRows, extraRows), "utf8");
  if (failures.length > 0) {
    console.error(renderRows(failures));
    process.exit(1);
  }
  console.log(renderRows([...fixtures, ...wrongRows, ...extraRows]));
}

function renderTable(fixtures: Fixture[], wrongRows: Fixture[], extraRows: Fixture[]): string {
  return [
    "# Grader v2 fixture outcomes",
    "",
    "## Frozen pilot answers",
    "",
    renderRows(fixtures),
    "",
    "## Deliberately wrong cases",
    "",
    renderRows(wrongRows),
    "",
    "## Additional semantic cases",
    "",
    renderRows(extraRows),
    "",
  ].join("\n");
}

function renderRows(rows: Fixture[]): string {
  return [
    "| row | fixture | expected | actual | reason |",
    "| --- | --- | --- | --- | --- |",
    ...rows.map((row) => `| ${row.rowId} | ${row.arm} | ${row.expected} | ${row.actual} | ${row.reason} |`),
  ].join("\n");
}

await main();
