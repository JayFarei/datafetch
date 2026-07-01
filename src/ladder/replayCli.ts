// CLI backing bin/ladder-replay. Exact flag surface (BUILD-SPEC §5, checks
// V2/V6 shell out to these):
//
//   ladder-replay --self-test --double-run
//     exit 0 iff replaying pinned fixture episodes twice is byte-identical.
//
//   ladder-replay --ablate-promoted --state <ladder-state.json> --episodes <episodes.jsonl>
//     exit 0 iff every promoted procedure's removal changes its origin
//     episode's replayed answer; exit 1 naming the decorative procedure.

import path from "node:path";

import { REPO_ROOT } from "./paths.js";
import { ablatePromoted, selfTestDoubleRun } from "./replay.js";

const SELFTEST_EPISODES = path.join(REPO_ROOT, "eval", "ladder", "selftest", "episodes.jsonl");

function flagValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
}

function main(argv: string[]): number {
  const args = argv.slice(2);

  if (args.includes("--self-test") && args.includes("--double-run")) {
    const res = selfTestDoubleRun(SELFTEST_EPISODES);
    if (res.ok) {
      console.log(`self-test OK: ${res.checked} pinned episodes byte-identical on double-run`);
      return 0;
    }
    console.error(`self-test FAILED: divergence at ${res.firstDivergence ?? "?"}`);
    return 1;
  }

  if (args.includes("--ablate-promoted")) {
    const statePath = flagValue(args, "--state");
    const episodesPath = flagValue(args, "--episodes");
    if (!statePath || !episodesPath) {
      console.error("usage: ladder-replay --ablate-promoted --state <path> --episodes <path>");
      return 2;
    }
    const res = ablatePromoted(statePath, episodesPath);
    if (res.ok) {
      console.log(`ablation OK: ${res.checked} promoted procedures are load-bearing`);
      return 0;
    }
    console.error(`ablation FAILED: ${res.offender} — ${res.reason}`);
    return 1;
  }

  console.error(
    "usage:\n" +
      "  ladder-replay --self-test --double-run\n" +
      "  ladder-replay --ablate-promoted --state <ladder-state.json> --episodes <episodes.jsonl>",
  );
  return 2;
}

process.exit(main(process.argv));
