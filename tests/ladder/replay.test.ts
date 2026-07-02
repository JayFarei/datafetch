import { execFileSync } from "node:child_process";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "../../src/ladder/paths.js";
import { ablatePromoted, selfTestDoubleRun } from "../../src/ladder/replay.js";

const SELFTEST = path.join(REPO_ROOT, "eval", "ladder", "selftest");
const EPISODES = path.join(SELFTEST, "episodes.jsonl");
const STATE_POS = path.join(SELFTEST, "ladder-state.json");
const STATE_DEC = path.join(SELFTEST, "ladder-state-decorative.json");
const BIN = path.join(REPO_ROOT, "bin", "ladder-replay");

describe("replay determinism (V2)", () => {
  it("double-run of pinned fixture episodes is byte-identical", () => {
    const res = selfTestDoubleRun(EPISODES);
    expect(res.ok).toBe(true);
    expect(res.checked).toBe(5);
  });
});

describe("credit ablation (V6)", () => {
  it("all promoted procedures in the positive state are load-bearing", () => {
    const res = ablatePromoted(STATE_POS, EPISODES);
    expect(res.ok).toBe(true);
  });

  it("catches a decorative shim promoted in the negative state", () => {
    const res = ablatePromoted(STATE_DEC, EPISODES);
    expect(res.ok).toBe(false);
    expect(res.offender).toBe("shallow-control");
  });
});

describe("bin/ladder-replay exact flag surface (BUILD-SPEC §5)", () => {
  it("--self-test --double-run exits 0", () => {
    execFileSync(BIN, ["--self-test", "--double-run"], { cwd: REPO_ROOT });
  });

  it("--ablate-promoted exits 0 on the positive state", () => {
    execFileSync(BIN, ["--ablate-promoted", "--state", STATE_POS, "--episodes", EPISODES], { cwd: REPO_ROOT });
  });

  it("--ablate-promoted exits nonzero on the decorative state", () => {
    expect(() =>
      execFileSync(BIN, ["--ablate-promoted", "--state", STATE_DEC, "--episodes", EPISODES], { cwd: REPO_ROOT, stdio: "pipe" }),
    ).toThrow();
  });
});
