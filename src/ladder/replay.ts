// Replay: recompute an episode's answer from world-state, honestly.
//
// Replay never trusts the recorded answer — it re-mounts the snapshot and
// re-runs the executor from (tenant, taskId, arm, lineage). This backs two
// verifier checks that shell out to bin/ladder-replay:
//   V2  replay determinism  — the double-run self-test.
//   V6  credit ablation     — removing a promoted procedure must change the
//                             replayed answer of its origin episode.

import fs from "node:fs";

import { execute, type Procedure } from "./executor.js";
import { tenantSnapshotDir } from "./paths.js";
import { buildRegistry, without } from "./registry.js";
import { canonicalJson } from "./serialize.js";
import { mountSnapshot } from "./snapshot.js";
import { fullParam, getTask } from "./tasks.js";
import type { Answer, Episode, LadderState } from "./types.js";

export interface ReplayResult {
  answer: Answer;
  turns: number;
  drifted: boolean;
  /** fingerprint of the snapshot actually mounted for this replay. */
  snapshotHash: string;
}

/** Recompute an episode's answer from the live snapshot + registry. */
export function replayEpisode(
  episode: Pick<Episode, "tenant" | "taskId" | "arm" | "lineage" | "taskParam">,
  registry: ReadonlyMap<string, Procedure>,
): ReplayResult {
  const snapshot = mountSnapshot(tenantSnapshotDir(episode.tenant), episode.tenant);
  const task = getTask(episode.taskId);
  // the recorded query window; rows without one replay at the full corpus
  const param =
    episode.taskParam ?? fullParam((snapshot.collections[task.sourceCollection] ?? []).length);
  return {
    ...execute(task, param, episode.arm, episode.lineage ?? [], registry, snapshot),
    snapshotHash: snapshot.sourceFingerprint,
  };
}

/**
 * Reproducibility guard: a replay is only admissible if it ran against the SAME
 * world-state the episode was committed on (mounted fingerprint == recorded
 * snapshotHash) AND it reproduces the committed answer. Without this, replay
 * proves only in-process determinism against today's fixtures, not that the
 * committed evidence is reproducible — a stale or forged answer would sail
 * through the double-run and the ablation alike. Returns an error string on
 * mismatch, or undefined when the replay is anchored.
 */
function anchorMismatch(episode: Episode, replay: ReplayResult): string | undefined {
  if (replay.snapshotHash !== episode.snapshotHash) {
    return `snapshotHash drift: recorded ${episode.snapshotHash}, mounted ${replay.snapshotHash}`;
  }
  if (canonicalJson(replay.answer) !== canonicalJson(episode.answer)) {
    return `answer not reproducible: recorded ${canonicalJson(episode.answer)}, replayed ${canonicalJson(replay.answer)}`;
  }
  return undefined;
}

export function readJsonl<T>(file: string): T[] {
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as T);
}

/**
 * Self-test: for every pinned fixture episode, require that (1) the replay runs
 * against the recorded world-state and reproduces the committed answer
 * (anchored), and (2) two replays are byte-identical (deterministic). Either an
 * unreproducible committed answer or a non-deterministic replay is a divergence.
 * Returns `{ ok, checked }`.
 */
export function selfTestDoubleRun(episodesPath: string): { ok: boolean; checked: number; firstDivergence?: string } {
  const episodes = readJsonl<Episode>(episodesPath);
  const registry = buildRegistry({ withControls: true });
  let checked = 0;
  for (const ep of episodes) {
    const a = replayEpisode(ep, registry);
    // anchor: replay must match the committed world-state + committed answer
    const anchor = anchorMismatch(ep, a);
    if (anchor) return { ok: false, checked, firstDivergence: `${ep.episodeId}: ${anchor}` };
    const b = replayEpisode(ep, registry);
    if (canonicalJson(a.answer) !== canonicalJson(b.answer) || a.turns !== b.turns) {
      return { ok: false, checked, firstDivergence: `${ep.episodeId}: non-deterministic` };
    }
    checked++;
  }
  return { ok: true, checked };
}

export interface AblationOutcome {
  ok: boolean;
  /** the decorative / unbacked procedure, when ok === false */
  offender?: string;
  reason?: string;
  checked: number;
}

/**
 * For every promoted procedure, replay its origin episode with and without the
 * procedure. If the answer is unchanged, the procedure is decorative (not
 * load-bearing) and the ablation fails, naming it.
 */
export function ablatePromoted(statePath: string, episodesPath: string): AblationOutcome {
  const state = JSON.parse(fs.readFileSync(statePath, "utf8")) as LadderState;
  const episodes = readJsonl<Episode>(episodesPath);
  const registry = buildRegistry({ withControls: true });

  const promoted = Object.entries(state)
    .filter(([, e]) => e.state === "promoted")
    .map(([id]) => id);

  let checked = 0;
  for (const id of promoted) {
    const origin = episodes.find(
      (ep) => ep.arm === "exposed" && (ep.lineage ?? []).includes(id),
    );
    if (!origin) {
      return { ok: false, offender: id, reason: "promoted but never on an exposed answer path", checked };
    }
    const full = replayEpisode(origin, registry);
    // anchor the ablation to committed evidence: the origin episode must replay
    // against its recorded snapshot and reproduce its recorded answer, else the
    // "change on removal" is measured against stale/forged evidence, not truth.
    const anchor = anchorMismatch(origin, full);
    if (anchor) {
      return { ok: false, offender: id, reason: `origin episode not reproducible (${anchor})`, checked };
    }
    const ablated = replayEpisode(origin, without(registry, id));
    if (canonicalJson(full.answer) === canonicalJson(ablated.answer)) {
      return { ok: false, offender: id, reason: "removal did not change the replayed answer (decorative)", checked };
    }
    checked++;
  }
  return { ok: true, checked };
}
