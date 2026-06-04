import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  getMountRuntimeRegistry,
  setMountRuntimeRegistry,
  InMemoryMountRuntimeRegistry,
  makeMountRuntime,
} from "../src/adapter/runtime.js";
import { buildIdentMap } from "../src/bootstrap/idents.js";
import { regenerateManifest } from "../src/server/manifest.js";
import { cragMountFromRows, toCragResultRow } from "../src/eval/cragMount.js";
import { scoreCragRow } from "../src/eval/cragGrader.js";
import type { CragRow } from "../src/eval/cragCorpus.js";

// C4 live-prep #2: CRAG onboards as a df.db collection via the public registry
// path (same mechanism as the zero-src onboarding test) and the gold flows
// through the grader glue. Uses synthetic rows so it always runs; the real-data
// load is covered by sac-crag-corpus.test.ts.

const ROWS: CragRow[] = [
  { interactionId: "q1", query: "how many 3-point attempts did steve nash average", gold: "4", questionType: "post-processing", staticOrDynamic: "static", domain: "sports", queryTime: "", answerType: "valid" },
  { interactionId: "q2", query: "what is the market cap of microsoft", gold: "3 trillion", questionType: "simple", staticOrDynamic: "fast-changing", domain: "finance", queryTime: "", answerType: "valid" },
  { interactionId: "q3", query: "who directed the movie that never existed", gold: "invalid question", questionType: "false_premise", staticOrDynamic: "static", domain: "movie", queryTime: "", answerType: "invalid" },
];

describe("CRAG mount (df.db onboarding) + grader glue", () => {
  let baseDir: string | null = null;
  afterEach(async () => {
    setMountRuntimeRegistry(new InMemoryMountRuntimeRegistry());
    if (baseDir) { await rm(baseDir, { recursive: true, force: true }); baseDir = null; }
  });

  it("findExact (by domain / id) + search retrieve the right rows", async () => {
    const mount = cragMountFromRows("crag-test", ROWS);
    const coll = mount.collection<Record<string, unknown>>("records");
    const sports = await coll.findExact({ family: "sports" } as never);
    expect(sports.map((r) => (r as { id: string }).id)).toEqual(["q1"]);
    const byId = await coll.findExact({ id: "q3" } as never);
    expect((byId[0] as { label: string }).label).toContain("never existed");
    const hits = await coll.search("market cap microsoft");
    expect((hits[0] as { id: string }).id).toBe("q2");
  });

  it("onboards as df.db via the public registry path (zero-src), surfacing the collection in df.d.ts", async () => {
    baseDir = await mkdtemp(path.join(tmpdir(), "sac-crag-mount-"));
    const mount = cragMountFromRows("crag-2024", ROWS);
    getMountRuntimeRegistry().register(
      "crag-2024",
      makeMountRuntime({ mountId: "crag-2024", adapter: mount, identMap: buildIdentMap(["records"]) }),
    );
    await regenerateManifest({ baseDir, tenantId: "crag-2024" });
    const dts = await readFile(path.join(baseDir, "df.d.ts"), "utf8");
    expect(dts).toContain("db: {");
    expect(dts).toContain("records: CollectionHandle;");
    expect(dts).toContain("interface CollectionHandle {");
  });

  it("grader glue carries derived answer_type: false-premise decline beats confident-wrong", () => {
    const fp = ROWS[2]!; // answerType 'invalid'
    expect(scoreCragRow(toCragResultRow(fp, "invalid question"))).toBe("accurate"); // governed decline
    expect(scoreCragRow(toCragResultRow(fp, "Steven Spielberg"))).toBe("incorrect"); // ungoverned confident-wrong
    expect(scoreCragRow(toCragResultRow(fp, ""))).toBe("missing");
    // valid row: exact gold match
    expect(scoreCragRow(toCragResultRow(ROWS[0]!, "about 4 per game"))).toBe("accurate");
  });
});
