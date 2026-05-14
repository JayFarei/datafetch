// Goal-4 iter 6 — cross-shape transfer smoke (R9's proof).
//
// R9: the same `intentSignature` crystallises a helper that is reused
// across tenants with DIFFERENT data shapes. This smoke proves it
// end-to-end with a deliberate transfer harness:
//
//   1. Tenant A ("widgets"): build a pure tool fan-out trajectory over
//      a `widgets_api` bundle. Author the parameterised fan-out helper.
//   2. Tenant B ("gadgets"): build a structurally-identical fan-out
//      trajectory over a COMPLETELY different data shape — `gadgets_api`
//      bundle, different tool names, different param name. Assert it
//      hashes to the SAME `intentSignature` as tenant A's.
//   3. Transfer: copy tenant A's crystallised helper file into tenant
//      B's lib overlay (the "deliberate transfer harness" the architect
//      flagged — today's lib-cache is family-partitioned, so cross-
//      tenant sharing is an explicit copy).
//   4. Resolve the transferred helper from tenant B's lib and INVOKE it
//      with tenant B's parameters (gadgets bundle / tools / param) over
//      a stubbed `df.tool`.
//   5. Assert: the helper — LEARNED from the widgets data shape —
//      returns a correct fan-out over the gadgets data shape, calling
//      gadgets_api tools. That is cross-shape transfer.
//
// Run with:  pnpm tsx src/observer/__smoke__/cross-shape-transfer.ts

import { promises as fsp } from "node:fs";
import path from "node:path";

import { authorFunction } from "../author.js";
import { extractTemplateFromCalls } from "../template.js";
import { DiskLibraryResolver } from "../../snippet/library.js";
import type { LibraryResolver, TrajectoryRecord } from "../../sdk/index.js";

type CheckResult = { name: string; pass: boolean; detail?: string };

const ISO = new Date().toISOString();

// --- Tenant A: a "widgets" catalogue ---------------------------------------
// The agent fanned out two widgets_api tools over three widget ids.
function widgetsTrajectory(): TrajectoryRecord {
  const calls: TrajectoryRecord["calls"] = [];
  let idx = 0;
  for (const widgetId of [101, 102, 103]) {
    for (const tool of ["local-widgets_get_spec", "local-widgets_get_price"]) {
      calls.push({
        index: idx++,
        primitive: `tool.widgets_api.${tool}`,
        input: { widget_id: widgetId, region: "us" },
        output: { tool, widget_id: widgetId, ok: true },
        startedAt: ISO,
        durationMs: 1,
      });
    }
  }
  return {
    id: "traj_widgets_a",
    tenantId: "transfer-tenant-a",
    question: "build a widgets catalogue",
    mode: "novel",
    calls,
    createdAt: ISO,
  };
}

// --- Tenant B: a "gadgets" inventory — a DIFFERENT data shape --------------
// Different bundle (gadgets_api), different tool names, different param
// name (gadget_code, a string, not a numeric id), different shared field.
function gadgetsTrajectory(): TrajectoryRecord {
  const calls: TrajectoryRecord["calls"] = [];
  let idx = 0;
  for (const gadgetCode of ["gx-a", "gx-b", "gx-c"]) {
    for (const tool of ["local-gadgets_get_details", "local-gadgets_get_stock"]) {
      calls.push({
        index: idx++,
        primitive: `tool.gadgets_api.${tool}`,
        input: { gadget_code: gadgetCode, warehouse: "eu" },
        output: { tool, gadget_code: gadgetCode, ok: true },
        startedAt: ISO,
        durationMs: 1,
      });
    }
  }
  return {
    id: "traj_gadgets_b",
    tenantId: "transfer-tenant-b",
    question: "build a gadgets inventory",
    mode: "novel",
    calls,
    createdAt: ISO,
  };
}

async function main(): Promise<void> {
  if (!process.env["DATAFETCH_INTERFACE_MODE"]) {
    process.env["DATAFETCH_INTERFACE_MODE"] = "legacy";
  }
  const baseDir = path.join(
    "/tmp",
    `df-cross-shape-smoke-${process.pid}-${Date.now()}`,
  );
  await fsp.mkdir(baseDir, { recursive: true });
  const checks: CheckResult[] = [];

  // 1. Author the fan-out helper from tenant A's widgets data shape.
  const trajA = widgetsTrajectory();
  const trajB = gadgetsTrajectory();
  const templateA = extractTemplateFromCalls(trajA.calls, trajA, "fanout");
  const templateB = extractTemplateFromCalls(trajB.calls, trajB, "fanout");

  // 2. The data-shape-agnostic property: structurally-identical fan-outs
  //    over different data shapes share an intentSignature.
  checks.push({
    name: "tenant A and tenant B fan-outs share an intentSignature (data-shape-agnostic)",
    pass:
      templateA.intentSignature === templateB.intentSignature &&
      templateA.intentSignature.includes("FANOUT(tool"),
    detail: `A=${templateA.intentSignature} B=${templateB.intentSignature}`,
  });

  const resolver: LibraryResolver = new DiskLibraryResolver({ baseDir });
  const authored = await authorFunction({
    tenantId: "transfer-tenant-a",
    baseDir,
    trajectory: trajA,
    template: templateA,
    libraryResolver: resolver,
    codifierSkill: null,
  });
  checks.push({
    name: "tenant A's fan-out crystallises a parameterised helper",
    pass: authored.kind === "authored",
    detail:
      authored.kind === "authored"
        ? `name=${authored.name}`
        : `skipped: ${authored.reason}`,
  });
  if (authored.kind !== "authored") {
    finalizeAndExit(checks);
    return;
  }
  const helperName = authored.name;
  const helperSource = await fsp.readFile(authored.path, "utf8");
  checks.push({
    name: "helper body is parameterised over toolBundle (not frozen to widgets_api)",
    pass:
      helperSource.includes("df.tool[input.toolBundle]") &&
      !helperSource.includes("df.tool.widgets_api["),
    detail: helperSource.includes("df.tool.widgets_api[")
      ? "FROZEN to widgets_api — would not transfer"
      : "parameterised",
  });

  // 3. Transfer: copy tenant A's helper into tenant B's lib overlay.
  //    This is the deliberate transfer harness — cross-tenant sharing
  //    is an explicit copy because the lib-cache is tenant-partitioned.
  const tenantBLibDir = path.join(baseDir, "lib", "transfer-tenant-b");
  await fsp.mkdir(tenantBLibDir, { recursive: true });
  await fsp.copyFile(
    authored.path,
    path.join(tenantBLibDir, `${helperName}.ts`),
  );
  checks.push({
    name: "helper transferred into tenant B's lib overlay",
    pass: true,
  });

  // 4. Resolve the transferred helper from tenant B and invoke it with
  //    tenant B's parameters over a stubbed df.tool.
  const transferred = await resolver.resolve("transfer-tenant-b", helperName);
  checks.push({
    name: "transferred helper resolves under tenant B",
    pass: transferred !== null,
  });
  if (transferred === null) {
    finalizeAndExit(checks);
    return;
  }

  // Stub df.tool with tenant B's gadgets_api bundle. The helper body
  // reads `df.tool[input.toolBundle][toolName]` — a global the snippet
  // runtime normally injects; here we inject it directly for the
  // one-shot invocation.
  const gadgetsCalls: Array<{ tool: string; gadget_code: unknown; warehouse: unknown }> = [];
  const stubGadget = (toolName: string) =>
    async (input: Record<string, unknown>): Promise<unknown> => {
      gadgetsCalls.push({
        tool: toolName,
        gadget_code: input["gadget_code"],
        warehouse: input["warehouse"],
      });
      return { tool: toolName, gadget_code: input["gadget_code"], ok: true };
    };
  const priorDf = (globalThis as Record<string, unknown>)["df"];
  (globalThis as Record<string, unknown>)["df"] = {
    tool: {
      gadgets_api: {
        "local-gadgets_get_details": stubGadget("local-gadgets_get_details"),
        "local-gadgets_get_stock": stubGadget("local-gadgets_get_stock"),
      },
    },
  };

  let invocationError: string | null = null;
  let resultValue: unknown = null;
  try {
    const result = await transferred({
      entityValues: ["gx-a", "gx-b"],
      toolBundle: "gadgets_api",
      toolNames: ["local-gadgets_get_details", "local-gadgets_get_stock"],
      paramName: "gadget_code",
      sharedInput: { warehouse: "eu" },
    });
    resultValue = (result as { value?: unknown }).value;
  } catch (err) {
    invocationError = err instanceof Error ? err.message : String(err);
  } finally {
    if (priorDf === undefined) {
      delete (globalThis as Record<string, unknown>)["df"];
    } else {
      (globalThis as Record<string, unknown>)["df"] = priorDf;
    }
  }

  checks.push({
    name: "transferred helper invokes without error on tenant B's data shape",
    pass: invocationError === null,
    detail: invocationError ?? undefined,
  });

  // 5. The R9 assertion: the helper LEARNED from widgets data ran a
  //    correct fan-out over GADGETS data — calling gadgets_api tools,
  //    with gadget_code values, never touching widgets_api.
  const calledGadgetsApi = gadgetsCalls.length > 0;
  const calledBothTools =
    gadgetsCalls.some((c) => c.tool === "local-gadgets_get_details") &&
    gadgetsCalls.some((c) => c.tool === "local-gadgets_get_stock");
  const coveredBothEntities =
    new Set(gadgetsCalls.map((c) => c.gadget_code)).size === 2;
  const passedSharedInput = gadgetsCalls.every((c) => c.warehouse === "eu");
  checks.push({
    name: "helper fanned out gadgets_api tools over gadget_code entities (cross-shape transfer)",
    pass: calledGadgetsApi && calledBothTools && coveredBothEntities && passedSharedInput,
    detail: `calls=${gadgetsCalls.length} bothTools=${calledBothTools} bothEntities=${coveredBothEntities} sharedInput=${passedSharedInput}`,
  });
  checks.push({
    name: "helper returned a per-entity fan-out result for tenant B",
    pass:
      Array.isArray(resultValue) &&
      resultValue.length === 2 &&
      (resultValue as Array<{ entityValue?: unknown; tools?: unknown }>).every(
        (r) => r.entityValue !== undefined && typeof r.tools === "object",
      ),
    detail: JSON.stringify(resultValue)?.slice(0, 200),
  });

  finalizeAndExit(checks, {
    helperName,
    intentSignature: templateA.intentSignature,
    helperFirstLines: helperSource.split("\n").slice(0, 30).join("\n"),
  });
}

function finalizeAndExit(
  checks: CheckResult[],
  debug?: {
    helperName?: string;
    intentSignature?: string;
    helperFirstLines?: string;
  },
): void {
  let failed = 0;
  for (const r of checks) {
    const status = r.pass ? "PASS" : "FAIL";
    console.log(`[${status}] ${r.name}`);
    if (!r.pass && r.detail) console.log(`  detail: ${r.detail.slice(0, 800)}`);
    if (!r.pass) failed += 1;
  }
  console.log("");
  console.log(
    `${checks.length - failed}/${checks.length} passed${
      failed > 0 ? ` (${failed} failed)` : ""
    }`,
  );
  if (debug?.helperName) {
    console.log(
      `\ntransferred helper: ${debug.helperName} (intentSignature: ${debug.intentSignature})`,
    );
  }
  if (failed > 0 && debug?.helperFirstLines) {
    console.log(`--- helper source (first 30 lines) ---\n${debug.helperFirstLines}`);
  }
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("cross-shape-transfer smoke crashed:", err);
  process.exit(1);
});
