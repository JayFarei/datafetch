// Shadow-pair counterfactual harness (defeaters D4/D5, checks V3/V7:G1).
//
// A shadow pair runs the SAME query against the SAME snapshot on two arms:
//   - exposed: the library-backed procedure lineage (cheap, index-reads)
//   - masked:  the honest inline computation over raw records (costly scan)
// Both arms are real executions over real mounted data; `turns` is MEASURED by
// the executor, never a constant. The two rows share a `pairId`, so the
// verifier can re-observe that they are truly paired (same query, same
// snapshotHash, interleaved within the pinned window).
//
// The counterfactual is only honest if the masked arm never sees the library.
// We WRITE the actual outbound prompt for each arm to disk; the masked prompt
// contains zero library tokens and the exposed prompt genuinely references the
// library surface the mask removes. The verifier greps the files (V3), not this
// module — so the mask is proven by the world, not asserted by config.

import fs from "node:fs";
import path from "node:path";

import { validateAnswer } from "./answerContract.js";
import { execute, type Procedure } from "./executor.js";
import { repoRelative } from "./paths.js";
import { canonicalJson } from "./serialize.js";
import type { MountedSnapshot } from "./snapshot.js";
import { getTask, type Task } from "./tasks.js";
import type { Answer, Arm, Episode } from "./types.js";

/** The exact tokens verify/ladder.sh (V3) greps masked prompts for. */
export const LIBRARY_TOKENS = /df\.lib|apropos|df\.d\.ts|\bman\(/;

interface ArmOutcome {
  answer: Answer;
  turns: number;
  drifted: boolean;
}

export interface PairScore {
  exposed: ArmOutcome;
  masked: ArmOutcome;
  /** exposed arm won its counterfactual on cost (and stayed correct) */
  win: boolean;
}

/** An empty list is a degenerate/trivial answer, excluded from win counting (D2). */
function isTrivial(answer: Answer): boolean {
  return answer.kind === "list" && answer.items.length === 0;
}

/**
 * The exposed arm WINS its pair iff it is correct AND cheaper:
 *   - not an abstain (a drifted/absent procedure loses),
 *   - not a trivial/empty answer (degenerate control excluded, D2),
 *   - byte-identical to the honest masked baseline (correctness parity),
 *   - strictly fewer measured turns than the inline scan (the real cost win).
 */
export function isWin(exposed: ArmOutcome, masked: ArmOutcome): boolean {
  if (exposed.answer.kind === "abstain") return false;
  if (isTrivial(exposed.answer)) return false;
  if (canonicalJson(exposed.answer) !== canonicalJson(masked.answer)) return false;
  return exposed.turns < masked.turns;
}

/**
 * Run both arms of a pair and score the counterfactual. Pure w.r.t. disk — used
 * by the state machine and the drift/floor probes where prompt files are not
 * needed.
 */
export function scorePair(
  taskId: string,
  lineage: string[],
  registry: ReadonlyMap<string, Procedure>,
  snapshot: MountedSnapshot,
): PairScore {
  const task = getTask(taskId);
  const exposed = execute(task, "exposed", lineage, registry, snapshot);
  const masked = execute(task, "masked", [], registry, snapshot);
  return { exposed, masked, win: isWin(exposed, masked) };
}

/**
 * Write the outbound prompt for each arm to disk and return absolute paths.
 * The masked prompt is deliberately free of every library token; the exposed
 * prompt names the df.lib procedures + man()/df.d.ts surface the mask removes,
 * so the counterfactual delta is a real difference in what the arm can see.
 */
export function writePairPrompts(
  promptDir: string,
  pairId: string,
  tenant: string,
  task: Task,
  lineage: string[],
): { exposedPath: string; maskedPath: string } {
  fs.mkdirSync(promptDir, { recursive: true });

  const maskedBody =
    `TENANT ${tenant}\n` +
    `QUERY: ${task.query}\n` +
    `Instructions: compute the answer ONLY from the raw ${task.sourceCollection} records provided below. ` +
    `No helper procedures and no procedure catalogue are available to you.\n`;

  const head = lineage[0] ?? "procedure";
  const exposedBody =
    `TENANT ${tenant}\n` +
    `QUERY: ${task.query}\n` +
    `Instructions: use the df.lib procedure(s) [${lineage.join(", ")}]. ` +
    `Look up their signatures in df.d.ts and via man(${head}) / apropos.\n`;

  const exposedPath = path.join(promptDir, `${pairId}-exposed.txt`);
  const maskedPath = path.join(promptDir, `${pairId}-masked.txt`);
  fs.writeFileSync(exposedPath, exposedBody);
  fs.writeFileSync(maskedPath, maskedBody);
  return { exposedPath, maskedPath };
}

export interface PairEpisodesInput {
  pairId: string;
  tenant: string;
  taskId: string;
  lineage: string[];
  /** timestamp of the masked arm (epoch seconds) */
  tsMasked: number;
  /** timestamp of the exposed arm; |tsExposed - tsMasked| must be <= pairWindowSec */
  tsExposed: number;
  commit: string;
  preregHash?: string;
  promptDir: string;
  registry: ReadonlyMap<string, Procedure>;
  snapshot: MountedSnapshot;
}

export interface PairEpisodes {
  masked: Episode;
  exposed: Episode;
  win: boolean;
}

/**
 * Build the two `episodes.jsonl` rows for a shadow pair: run both arms, write
 * both prompt files, and emit well-formed episodes. The exposed row carries
 * `pairWin`; the masked row carries an empty lineage and no library prompt.
 */
export function buildPairEpisodes(input: PairEpisodesInput): PairEpisodes {
  const task = getTask(input.taskId);
  const score = scorePair(input.taskId, input.lineage, input.registry, input.snapshot);
  const { exposedPath, maskedPath } = writePairPrompts(
    input.promptDir,
    input.pairId,
    input.tenant,
    task,
    input.lineage,
  );
  const snapshotHash = input.snapshot.sourceFingerprint;

  const row = (
    arm: Arm,
    outcome: ArmOutcome,
    ts: number,
    promptAbs: string,
    lineage: string[],
    pairWin?: boolean,
  ): Episode => ({
    episodeId: `${input.pairId}-${arm}`,
    ts,
    commit: input.commit,
    ...(input.preregHash ? { preregHash: input.preregHash } : {}),
    tenant: input.tenant,
    driver: "scripted",
    query: task.query,
    taskId: input.taskId,
    snapshotHash,
    arm,
    pairId: input.pairId,
    promptPath: repoRelative(promptAbs),
    answer: outcome.answer,
    answerSchemaOk: validateAnswer(outcome.answer).ok,
    abstained: outcome.answer.kind === "abstain",
    drifted: outcome.drifted,
    turns: outcome.turns,
    lineage,
    ...(pairWin !== undefined ? { pairWin } : {}),
  });

  return {
    masked: row("masked", score.masked, input.tsMasked, maskedPath, []),
    exposed: row("exposed", score.exposed, input.tsExposed, exposedPath, input.lineage, score.win),
    win: score.win,
  };
}
