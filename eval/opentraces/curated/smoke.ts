import {
  blame,
  contextNodes,
  eventScan,
  fileEffort,
  patchSurvival,
  sessionsWhere,
  shareReport,
  skillReport,
  spendBy,
  syncBlockers,
  traceScan,
  wasteTop,
} from "./index.js";

const window = { start: "2026-04-26T00:00:00Z", end: "2026-06-11T00:00:00Z" };
const traces = await traceScan({ window });
const firstTrace = traces[0];
const firstSkill = traces.find((entry) => entry.skills.length > 0)?.skills[0] ?? "skill-installer";
let contextTrace: string | null = null;
let contextRows = [];
for (const entry of traces) {
  contextRows = await contextNodes({ traceId: entry.traceId });
  if (contextRows.length > 0) {
    contextTrace = entry.traceId;
    break;
  }
}

const eventSample = await eventScan({ types: ["git_anchor_created"], window });
const targetCommit = "05ecab6e9564a2a9d07b0ef8b190f12188284401";
const firstCommit =
  eventSample
    .map((entry) => entry.payload.commit_id)
    .filter((value): value is { hex?: unknown } => !!value && typeof value === "object" && !Array.isArray(value))
    .map((value) => value.hex)
    .find((value): value is string => value === targetCommit) ??
  eventSample
    .map((entry) => entry.payload.commit_id)
    .filter((value): value is { hex?: unknown } => !!value && typeof value === "object" && !Array.isArray(value))
    .map((value) => value.hex)
    .find((value): value is string => typeof value === "string") ?? "8ef256d0ce79e6d127c63f75fd4a2af3a87d6e70";

const results = {
  traceScan: { rows: traces.length, first: firstTrace?.traceId ?? null },
  eventScan: { rows: eventSample.length, firstType: eventSample[0]?.eventType ?? null },
  contextNodes: { rows: contextRows.length, traceId: contextTrace },
  spendBy: { rows: (await spendBy({ groupBy: "model", window })).length },
  wasteTop: { rows: (await wasteTop({ n: 3, window })).length },
  sessionsWhere: { rows: (await sessionsWhere({ window, committed: false, maxSteps: 10 })).length },
  skillReport: await skillReport({ skill: firstSkill, window }),
  shareReport: await shareReport({ window }),
  syncBlockers: await syncBlockers({ window }),
  blame: await blame({ commitSha: firstCommit }),
  fileEffort: await fileEffort({ glob: "**/*.md", window }),
  patchSurvival: await patchSurvival({ window }),
};

console.log(JSON.stringify(results, null, 2));
