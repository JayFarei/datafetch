// Runner for the S3 demo (BUILD-SPEC §6). Writes the committed evidence:
//   eval/ladder/runs/demo/          (tenant alpha — the verifier's RUN_DIR)
//   eval/ladder/runs/demo-tenant2/  (tenant beta  — the -tenant2 sibling)
//
//   pnpm ladder:demo   (or: tsx eval/ladder/scripts/run-demo.ts)
//
// Then gate it: ./verify/ladder.sh eval/ladder/runs/demo

import { DEMO_DIR, DEMO_TENANT2_DIR, runDemo } from "../../../src/ladder/demo.js";

const { alpha, beta } = runDemo();

const line = (t: { tenant: string; rows: unknown[]; promoted: string[]; rejected: string[]; terminalState: string }) =>
  `${t.tenant}: ${t.rows.length} episodes, promoted [${t.promoted.join(", ")}], rejected [${t.rejected.join(", ")}], terminal=${t.terminalState}`;

console.log(line(alpha));
console.log(line(beta));
console.log(`wrote ${DEMO_DIR} and ${DEMO_TENANT2_DIR}`);
