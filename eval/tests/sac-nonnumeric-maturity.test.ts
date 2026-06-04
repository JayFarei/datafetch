import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { nonNumericAcceptFixture } from "../skillcraft/probes/fixtures.js";
import { validateAuthoredFromSourceHelpers } from "../../src/observer/quarantineValidator.js";
import { HookRegistry, setHookRegistry } from "../../src/hooks/registry.js";
import { readManifest } from "../../src/hooks/manifest.js";
import { DiskLibraryResolver } from "../../src/snippet/library.js";

// Phase-2 verification (b): "a non-numeric helper reaching validated-typescript
// maturity via the registry".
//
// The governance probes (eval/skillcraft/probes/*) deliberately run the gate
// WITHOUT an installed hook registry, so a clean PASS leaves `promoted=false`
// and never exercises the maturity flip (governanceGate.ts documents this). The
// flip itself is in-process substrate machinery (no LLM / live run): on a
// governed PASS, validateOne calls registry.validateImplementation (load+export
// check -> candidate-typescript) then registry.smokeReplayAndPromote with an
// empty expected-primitive list. The non-numeric classifier body is pure
// computation (no df.* primitives), so extractAuthoredPrimitives === [] matches
// the empty expected list and the manifest is promoted to validated-typescript.
//
// This test installs a real HookRegistry (disk resolver, same baseDir, so the
// `@datafetch/sdk` import rewrite that loadHelper relies on also applies here)
// and asserts the STRING-answer helper reaches validated-typescript maturity.
describe("Phase-2 (b): non-numeric helper reaches validated-typescript maturity via the registry", () => {
  let baseDir: string | null = null;

  afterEach(async () => {
    setHookRegistry(null);
    if (baseDir) {
      await rm(baseDir, { recursive: true, force: true });
      baseDir = null;
    }
  });

  it("promotes the string-classifier helper to validated-typescript on a governed PASS", async () => {
    const fx = nonNumericAcceptFixture();

    // Materialise the fixture (helper + originating + held-out sibling) into an
    // isolated baseDir, mirroring the probe harness layout.
    baseDir = await mkdtemp(path.join(tmpdir(), "sac-nonnumeric-maturity-"));
    const libDir = path.join(baseDir, "lib", fx.tenantId);
    const trajDir = path.join(baseDir, "trajectories");
    await mkdir(libDir, { recursive: true });
    await mkdir(trajDir, { recursive: true });
    await writeFile(path.join(libDir, `${fx.helperName}.ts`), fx.helperSource, "utf8");
    await writeFile(
      path.join(trajDir, `${fx.originating.id}.json`),
      JSON.stringify(fx.originating, null, 2),
      "utf8",
    );
    await writeFile(
      path.join(trajDir, `${fx.sibling.id}.json`),
      JSON.stringify(fx.sibling, null, 2),
      "utf8",
    );

    // Install the registry the probes omit, so the governed promote step runs.
    setHookRegistry(
      new HookRegistry({
        baseDir,
        resolver: new DiskLibraryResolver({ baseDir }),
        mode: "hooks-draft",
      }),
    );

    const results = await validateAuthoredFromSourceHelpers({
      baseDir,
      tenantId: fx.tenantId,
    });
    const r = results.find((x) => x.helperName === fx.helperName);

    // The governed gate PASSES on the non-numeric helper (idempotent && generic)
    // and, with a registry installed, actually promotes it.
    expect(r).toBeDefined();
    expect(r?.idempotent).toBe(true);
    expect(r?.generic).toBe(true);
    expect(r?.promoted).toBe(true);

    // The verification the probes can't show: maturity flips to
    // validated-typescript via the registry, and the hook is callable.
    const manifest = await readManifest(baseDir, fx.tenantId, fx.helperName);
    expect(manifest).not.toBeNull();
    expect(manifest?.maturity).toBe("validated-typescript");
    expect(
      manifest?.callability === "callable" ||
        manifest?.callability === "callable-with-fallback",
    ).toBe(true);
  });
});
