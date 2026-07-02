// Typed answer contracts (defeater D9, check V1).
//
// The known LLM path of least resistance is to stuff prose into a string field
// and call it structured. These schemas make that a HARD REJECT: a `count`
// answer whose `value` is prose is not schema-valid, and a `list` answer whose
// items are bare strings is not schema-valid. `validateAnswer` is the single
// gate every committed answer passes through; the adversarial `prose-in-string`
// fixture is the standing proof that this gate can actually reject.

import * as v from "valibot";

import type { Answer } from "./types.js";

const CountSchema = v.object({
  kind: v.literal("count"),
  // Strictly a number. `{ kind: "count", value: "about forty" }` fails here.
  value: v.number(),
});

const ListSchema = v.object({
  kind: v.literal("list"),
  // Each item is a structured record of scalar fields — never a bare prose
  // string. `{ items: ["there are three topics"] }` fails here.
  items: v.array(v.record(v.string(), v.union([v.string(), v.number()]))),
});

const AbstainSchema = v.object({
  kind: v.literal("abstain"),
  reason: v.pipe(v.string(), v.minLength(1)),
});

const AnswerSchema = v.variant("kind", [CountSchema, ListSchema, AbstainSchema]);

export interface ContractResult {
  ok: boolean;
  /** populated when ok === false */
  error?: string;
}

/**
 * Validate a committed answer against its typed contract.
 *
 * Returns `{ ok: true }` for a well-formed count / list / abstain answer, and
 * `{ ok: false, error }` for anything else — including the prose-in-string
 * abuse this contract exists to reject.
 */
export function validateAnswer(answer: unknown): ContractResult {
  const parsed = v.safeParse(AnswerSchema, answer);
  if (parsed.success) return { ok: true };
  const first = parsed.issues[0];
  return { ok: false, error: first ? first.message : "invalid answer" };
}

export function makeAbstain(reason: string): Answer {
  return { kind: "abstain", reason };
}
