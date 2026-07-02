// Canonical JSON: deterministic serialization with recursively sorted object
// keys. Byte-identity of two answers (the V2 replay-determinism check) is
// decided by comparing canonicalJson output, so this must be stable across
// runs and independent of object key insertion order.

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortValue((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}
