import { promises as fsp } from "node:fs";

export type ToleranceSpec = {
  kind: string;
  value: number | null;
};

export type TemplateSpec = {
  id: string;
  answerType: string;
  tolerance: ToleranceSpec;
};

export type GradeResult = {
  correct: boolean | null;
  reason: string;
  answerType: string;
  tolerance: ToleranceSpec;
};

export async function loadTemplateSpecs(packYamlPath: string): Promise<Map<string, TemplateSpec>> {
  const specs = new Map<string, TemplateSpec>();
  let current: Partial<TemplateSpec> | null = null;
  let inTolerance = false;
  for (const line of (await fsp.readFile(packYamlPath, "utf8")).split("\n")) {
    const id = /^\s*-\s+id:\s*"?([^"]+)"?\s*$/.exec(line);
    if (id) {
      pushSpec(specs, current);
      current = { id: id[1], tolerance: { kind: "exact", value: 0 } };
      inTolerance = false;
      continue;
    }
    if (!current) continue;
    const answerType = /^\s*answer_type:\s*"?([^"]+)"?\s*$/.exec(line);
    if (answerType) {
      current.answerType = answerType[1];
      continue;
    }
    if (/^\s*tolerance:\s*$/.test(line)) {
      inTolerance = true;
      continue;
    }
    if (inTolerance) {
      const kind = /^\s*kind:\s*"?([^"]+)"?\s*$/.exec(line);
      if (kind) {
        current.tolerance = { ...(current.tolerance ?? { kind: "exact", value: 0 }), kind: kind[1] };
        continue;
      }
      const value = /^\s*value:\s*(.+?)\s*$/.exec(line);
      if (value) {
        current.tolerance = {
          ...(current.tolerance ?? { kind: "exact", value: 0 }),
          value: parseYamlScalar(value[1]),
        };
      }
    }
  }
  pushSpec(specs, current);
  return specs;
}

export function answerValue(snippet: unknown): unknown {
  if (!snippet || typeof snippet !== "object") return undefined;
  const answer = (snippet as Record<string, unknown>).answer;
  if (!answer || typeof answer !== "object") return undefined;
  return (answer as Record<string, unknown>).value;
}

export function gradeAnswer(input: {
  templateId: string;
  answerType: string;
  gold: unknown;
  actual: unknown;
  specs: Map<string, TemplateSpec>;
}): GradeResult {
  const spec = input.specs.get(input.templateId);
  const answerType = spec?.answerType ?? input.answerType;
  const tolerance = spec?.tolerance ?? { kind: "exact", value: 0 };
  if (input.actual === undefined) {
    return { correct: null, reason: "missing answer value", answerType, tolerance };
  }
  if (answerType === "exact_trace") {
    const expected = firstStringAtCanonicalKey(input.gold, "trace_id");
    if (!expected) return { correct: false, reason: "gold trace missing", answerType, tolerance };
    return {
      correct: containsString(input.actual, expected),
      reason: "exact trace containment",
      answerType,
      tolerance,
    };
  }
  const expected = normalizeForAnswerType(input.gold, answerType);
  const actual = normalizeForAnswerType(input.actual, answerType);
  const correct = compareValues(expected, actual, tolerance, answerTypeHasSetSemantics(answerType));
  return {
    correct,
    reason: correct ? "semantic match" : "semantic mismatch",
    answerType,
    tolerance,
  };
}

function pushSpec(specs: Map<string, TemplateSpec>, spec: Partial<TemplateSpec> | null): void {
  if (!spec?.id || !spec.answerType || !spec.tolerance) return;
  specs.set(spec.id, { id: spec.id, answerType: spec.answerType, tolerance: spec.tolerance });
}

function parseYamlScalar(text: string): number | null {
  const value = text.trim().replace(/^"|"$/g, "");
  if (value === "null") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function answerTypeHasSetSemantics(answerType: string): boolean {
  return answerType.includes("set") || answerType.includes("series");
}

function normalizeForAnswerType(value: unknown, answerType: string): unknown {
  if (answerTypeHasSetSemantics(answerType)) return normalizeSetLike(value);
  return canonicalize(value);
}

function normalizeSetLike(value: unknown): unknown[] {
  const rows = dictKeyedByGroupToRows(value);
  const array = Array.isArray(rows) ? rows : [rows];
  return array.map((item) => canonicalize(item));
}

function dictKeyedByGroupToRows(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const object = value as Record<string, unknown>;
  const entries = Object.entries(object);
  if (entries.length === 0) return [];
  if (!entries.every(([, item]) => item && typeof item === "object" && !Array.isArray(item))) return value;
  return entries.map(([group, row]) => ({ group, ...(row as Record<string, unknown>) }));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const canonical = canonicalKey(key);
    if (canonical === "group" && out.group !== undefined && out.group !== raw) {
      out[canonicalKey(key)] = canonicalize(raw);
    } else {
      out[canonical] = canonicalize(raw);
    }
  }
  return out;
}

function canonicalKey(key: string): string {
  const compact = key.replace(/[_\-\s]/g, "").toLowerCase();
  const mapped: Record<string, string> = {
    group: "group",
    model: "group",
    project: "group",
    day: "group",
    input: "input_tokens",
    inputtoken: "input_tokens",
    inputtokens: "input_tokens",
    totalinputtokens: "input_tokens",
    output: "output_tokens",
    outputtoken: "output_tokens",
    outputtokens: "output_tokens",
    totaloutputtokens: "output_tokens",
    cacheread: "cache_read_tokens",
    cachereads: "cache_read_tokens",
    cachereadtokens: "cache_read_tokens",
    totalcachereadtokens: "cache_read_tokens",
    cachewrite: "cache_write_tokens",
    cachewrites: "cache_write_tokens",
    cachewritetokens: "cache_write_tokens",
    cachecreationtokens: "cache_write_tokens",
    totalcachecreationtokens: "cache_write_tokens",
    sessions: "sessions",
    sessioncount: "sessions",
    count: "sessions",
    traceid: "trace_id",
    capturedrun: "trace_id",
    capturedruns: "trace_id",
    sessionid: "session_id",
    session: "session_id",
  };
  return mapped[compact] ?? key.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`).replace(/^_/, "");
}

function compareValues(expected: unknown, actual: unknown, tolerance: ToleranceSpec, unorderedArrays: boolean): boolean {
  if (typeof expected === "number") return typeof actual === "number" && numbersEqual(expected, actual, tolerance);
  if (expected === null || typeof expected !== "object") return Object.is(expected, actual);
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || expected.length !== actual.length) return false;
    if (!unorderedArrays) {
      return expected.every((item, index) => compareValues(item, actual[index], tolerance, unorderedArrays));
    }
    const used = new Set<number>();
    return expected.every((item) => {
      const index = actual.findIndex((candidate, candidateIndex) =>
        !used.has(candidateIndex) && compareValues(item, candidate, tolerance, unorderedArrays));
      if (index < 0) return false;
      used.add(index);
      return true;
    });
  }
  if (!actual || typeof actual !== "object" || Array.isArray(actual)) return false;
  const actualObject = actual as Record<string, unknown>;
  for (const [key, expectedValue] of Object.entries(expected as Record<string, unknown>)) {
    if (!(key in actualObject)) return false;
    if (!compareValues(expectedValue, actualObject[key], tolerance, unorderedArrays)) return false;
  }
  return true;
}

function numbersEqual(expected: number, actual: number, tolerance: ToleranceSpec): boolean {
  if (tolerance.kind === "relative") {
    const allowed = Math.abs(expected) * Number(tolerance.value ?? 0);
    return Math.abs(expected - actual) <= allowed;
  }
  if (tolerance.kind === "duration") return Math.abs(expected - actual) <= 0.1;
  return Math.abs(expected - actual) <= Number(tolerance.value ?? 0);
}

function firstStringAtCanonicalKey(value: unknown, key: string): string | null {
  if (typeof value === "string") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstStringAtCanonicalKey(item, key);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  for (const [rawKey, rawValue] of Object.entries(value as Record<string, unknown>)) {
    if (canonicalKey(rawKey) === key && typeof rawValue === "string") return rawValue;
    const found = firstStringAtCanonicalKey(rawValue, key);
    if (found) return found;
  }
  return null;
}

function containsString(value: unknown, needle: string): boolean {
  if (typeof value === "string") return value === needle;
  if (Array.isArray(value)) return value.some((item) => containsString(item, needle));
  if (!value || typeof value !== "object") return false;
  return Object.values(value as Record<string, unknown>).some((item) => containsString(item, needle));
}
