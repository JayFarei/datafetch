// Which captured session produced commit 067599b03f0bfcd8ac9650b18aa7511c7299641a?
const params = {
  "commit": "067599b03f0bfcd8ac9650b18aa7511c7299641a"
};
const anchors = await df.db.records.findExact({ kind: "anchor", commit: params.commit }, 5000);
const traceRows = await df.db.records.findExact({ kind: "trace" }, 5000);
const traceIds = new Set(anchors.map((row) => row.attributes.trace_id));
const sessions = traceRows
  .filter((row) => traceIds.has(row.attributes.trace_id))
  .map((row) => ({
    trace_id: row.attributes.trace_id,
    session_id: row.attributes.session_id ?? null,
    project: row.attributes.project,
  }))
  .sort((left, right) => String(left.trace_id).localeCompare(String(right.trace_id)));
return df.answer({
  status: "answered",
  value: { commit: params.commit, matching_anchor_events: anchors.length, sessions },
  evidence: { anchor_records_read: anchors.length, trace_records_read: traceRows.length },
});
