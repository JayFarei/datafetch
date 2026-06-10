// Which sessions in project 2026-03-27-community-traces-hf-24eb286b are blocked from sharing, grouped by safety tier?
const params = {
  "project": "2026-03-27-community-traces-hf-24eb286b"
};
const rows = await df.db.records.search(params.project, { limit: 5000 });
const blocked = rows
  .filter((row) => row.attributes.project === params.project && row.attributes.share_state === "blocked")
  .map((row) => ({
    trace_id: row.attributes.trace_id,
    session_id: row.attributes.session_id ?? null,
    safety_tier: row.attributes.safety_tier ?? "<unknown>",
  }))
  .sort((left, right) => String(left.trace_id).localeCompare(String(right.trace_id)));
const tier_breakdown = {};
for (const row of blocked) {
  const tier = String(row.safety_tier);
  tier_breakdown[tier] = (tier_breakdown[tier] ?? 0) + 1;
}
return df.answer({
  status: "answered",
  value: { blocked_sessions: blocked, tier_breakdown },
  evidence: { records_read: rows.length, project: params.project },
});
