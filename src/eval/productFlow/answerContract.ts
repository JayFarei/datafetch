// ProductFlow answer-contract helpers.
//
// The runner uses these helpers to support both the legacy stdout JSON shape
// and the workspace-lib `df.answer({ value })` shape without spreading answer
// parsing policy through the episode harness.

// Rewrite the agent's fire-and-forget IIFE pattern into top-level statements
// so DiskSnippetRuntime's `export const __df_done = (async () => { <body>
// })();` wrapper actually awaits the work.
//
// Matches the trailing `})();` (with optional `.catch(...)` and trailing
// semicolons / whitespace) and an opening `(async () => {` (or
// `(async function() {`). Whitespace-tolerant; rejects nested IIFEs.
export function unwrapFireAndForgetIife(source: string): string {
  let s = source.trimStart().startsWith("void ")
    ? source.replace(/^[\s]*void\s+/, "")
    : source;

  const openRe = /^\s*\(\s*async\s*(?:\(\s*\)\s*=>|function\s*[A-Za-z_$]*\s*\(\s*\))\s*\{\s*/;
  const m = openRe.exec(s);
  if (!m) return source;

  const bodyStart = m[0].length;
  const closeRe = /\}\s*\)\s*\(\s*\)(?:\s*\.\s*catch\s*\([^)]*\))?\s*;?\s*$/;
  const cm = closeRe.exec(s);
  if (!cm) return source;

  const bodyEnd = cm.index;
  if (bodyEnd <= bodyStart) return source;

  return s
    .slice(bodyStart, bodyEnd)
    .split("\n")
    .map((line) => (line.startsWith("  ") ? line.slice(2) : line))
    .join("\n");
}

export function selectAnswerValue(input: {
  stdout: string;
  answerEnvelope: unknown;
}): unknown {
  const stdoutAnswer = parseAnswerFromStdout(input.stdout);
  return stdoutAnswer !== undefined
    ? stdoutAnswer
    : answerValueFromEnvelope(input.answerEnvelope);
}

// Pull the last JSON-looking line out of stdout. Legacy productFlow prompts
// instruct scripts to end with `console.log(JSON.stringify(answer))`, so the
// last line containing a JSON object or array is the answer.
export function parseAnswerFromStdout(stdout: string): unknown {
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

export function answerValueFromEnvelope(answer: unknown): unknown {
  if (answer === null || typeof answer !== "object") return undefined;
  if (!("value" in answer)) return undefined;
  return (answer as { value?: unknown }).value;
}

export function answersEqual(actual: unknown, expected: unknown): boolean {
  return deepEqual(canonicaliseAnswer(actual), canonicaliseAnswer(expected));
}

// Canonicalise an object/array tree for deep comparison: arrays of objects with
// an `id` field get sorted by id ascending; plain arrays stay in-order.
export function canonicaliseAnswer(value: unknown): unknown {
  if (Array.isArray(value)) {
    const items = value.map(canonicaliseAnswer);
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
      out[key] = canonicaliseAnswer((value as Record<string, unknown>)[key]);
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
    for (const key of aKeys) {
      if (!deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
        return false;
      }
    }
    return true;
  }
  return false;
}
