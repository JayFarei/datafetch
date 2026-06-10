// For sessions started in the week of May 17, 2026 (UTC), how many input, output, cache-read, and cache-write tokens were spent, grouped by UTC start day?
const params = {
  "group_by": "day",
  "window": {
    "end": "2026-05-24T00:00:00Z",
    "label": "the week of May 17, 2026",
    "start": "2026-05-17T00:00:00Z"
  }
};
const rows = await df.db.records.findExact({ family: "P1-T1" }, 5000);
const start = Date.parse(params.window.start);
const end = Date.parse(params.window.end);
const totals = new Map();
let matched = 0;
for (const row of rows) {
  const attrs = row.attributes;
  const started = Date.parse(attrs.started_at);
  if (!Number.isFinite(started) || started < start || started >= end) continue;
  const group = String(attrs[params.group_by] ?? "<unknown>");
  const current = totals.get(group) ?? {
    group,
    sessions: 0,
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
  };
  current.sessions += 1;
  current.input_tokens += Number(attrs.input_tokens ?? 0);
  current.output_tokens += Number(attrs.output_tokens ?? 0);
  current.cache_read_tokens += Number(attrs.cache_read_tokens ?? 0);
  current.cache_write_tokens += Number(attrs.cache_write_tokens ?? 0);
  totals.set(group, current);
  matched += 1;
}
const groups = [...totals.values()].sort((left, right) => left.group.localeCompare(right.group));
return df.answer({
  status: "answered",
  value: { matched_sessions: matched, groups },
  evidence: { records_read: rows.length, group_by: params.group_by, window: params.window.label },
});
