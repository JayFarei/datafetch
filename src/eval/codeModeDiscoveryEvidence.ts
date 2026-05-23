export type CodeModeDiscoveryStatus = "proven" | "blocked";

export interface CodeModeDiscoveryEvent {
  index: number;
  kind: "inspect" | "helper-call";
  surface: string;
  source: string;
  excerpt: string;
}

export interface CodeModeDiscoveryEvidence {
  status: CodeModeDiscoveryStatus;
  inspectedSurfaces: string[];
  helperCallSeen: boolean;
  helperCallIndex: number | null;
  inspectedBeforeHelper: boolean;
  events: CodeModeDiscoveryEvent[];
  note: string;
}

const INSPECTION_PATTERNS: Array<{ surface: string; pattern: RegExp }> = [
  { surface: "AGENTS.md", pattern: /\b(?:AGENTS|CLAUDE)\.md\b/i },
  { surface: "df.d.ts", pattern: /\bdf\.d\.ts\b/i },
  { surface: "lib/", pattern: /\b(?:ls|find|rg|grep|cat|sed|less)\b[^;\n]*\blib(?:\/|\b)|\blib\/[A-Za-z0-9_./-]+\.ts\b/i },
  { surface: "datafetch apropos", pattern: /\b(?:datafetch\s+)?apropos\b/i },
  { surface: "datafetch man", pattern: /\b(?:datafetch\s+)?man\s+[A-Za-z0-9_$.-]+/i },
];

const HELPER_CALL_PATTERN = /\b(?:df\.)?lib\.[A-Za-z_$][\w$]*/;

export function analyzeCodeModeDiscoveryEvidence(input: Array<{
  source: string;
  text: string;
}>): CodeModeDiscoveryEvidence {
  const events: CodeModeDiscoveryEvent[] = [];
  input.forEach((item, index) => {
    const text = normaliseEventText(item.text);
    for (const { surface, pattern } of INSPECTION_PATTERNS) {
      if (pattern.test(text)) {
        events.push({
          index,
          kind: "inspect",
          surface,
          source: item.source,
          excerpt: excerpt(text, pattern),
        });
      }
    }
    const helperMatch = HELPER_CALL_PATTERN.exec(text);
    if (helperMatch) {
      events.push({
        index,
        kind: "helper-call",
        surface: helperMatch[0],
        source: item.source,
        excerpt: excerpt(text, HELPER_CALL_PATTERN),
      });
    }
  });

  const helperCallIndex = firstIndex(events, "helper-call");
  const inspectedBeforeHelper = helperCallIndex !== null && events.some((event) =>
    event.kind === "inspect" && event.index < helperCallIndex,
  );
  const inspectedSurfaces = [...new Set(
    events
      .filter((event) => event.kind === "inspect")
      .map((event) => event.surface),
  )].sort();

  return {
    status: inspectedBeforeHelper ? "proven" : "blocked",
    inspectedSurfaces,
    helperCallSeen: helperCallIndex !== null,
    helperCallIndex,
    inspectedBeforeHelper,
    events,
    note: noteFor({ inputCount: input.length, helperCallIndex, inspectedBeforeHelper, inspectedSurfaces }),
  };
}

function firstIndex(events: CodeModeDiscoveryEvent[], kind: CodeModeDiscoveryEvent["kind"]): number | null {
  const match = events.find((event) => event.kind === kind);
  return match ? match.index : null;
}

function noteFor(input: {
  inputCount: number;
  helperCallIndex: number | null;
  inspectedBeforeHelper: boolean;
  inspectedSurfaces: string[];
}): string {
  if (input.inputCount === 0) {
    return "No non-prompt agent event artifacts were available, so filesystem discovery is unobservable.";
  }
  if (input.inspectedBeforeHelper) {
    return `Ordered agent evidence shows inspection of ${input.inspectedSurfaces.join(", ")} before helper selection.`;
  }
  if (input.helperCallIndex !== null) {
    return "A helper call is visible, but no prior filesystem/code-surface inspection is visible in ordered agent evidence.";
  }
  if (input.inspectedSurfaces.length > 0) {
    return "Filesystem/code-surface inspection is visible, but no later helper selection is visible in ordered agent evidence.";
  }
  return "No filesystem/code-surface inspection or helper selection was visible in ordered agent evidence.";
}

function normaliseEventText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  try {
    return JSON.stringify(JSON.parse(trimmed));
  } catch {
    return trimmed;
  }
}

function excerpt(text: string, pattern: RegExp): string {
  const match = pattern.exec(text);
  if (!match) return text.slice(0, 180);
  const start = Math.max(0, match.index - 80);
  const end = Math.min(text.length, match.index + match[0].length + 80);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}
