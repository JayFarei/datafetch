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
import { getTask } from "./tasks.js";
import type { Answer, Episode, LadderState } from "./types.js";

export interface ReplayResult {
  answer: Answer;
  turns: number;
  drifted: boolean;
}

/** Recompute an episode's answer from the live snapshot + registry. */
export function replayEpisode(
  episode: Pick<Episode, "tenant" | "taskId" | "arm" | "lineage">,
  registry: ReadonlyMap<string, Procedure>,
): ReplayResult {
  const snapshot = mountSnapshot(tenantSnapshotDir(episode.tenant), episode.tenant);
  const task = getTask(episode.taskId);
  return execute(task, episode.arm, episode.lineage ?? [], registry, snapshot);
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
 * Self-test: replay each pinned fixture episode twice and require the two
 * canonical answers (and turn counts) to be byte-identical. Returns
 * `{ ok, checked }`.
 */
export function selfTestDoubleRun(episodesPath: string): { ok: boolean; checked: number; firstDivergence?: string } {
  const episodes = readJsonl<Episode>(episodesPath);
  const registry = buildRegistry({ withControls: true });
  let checked = 0;
  for (const ep of episodes) {
    const a = replayEpisode(ep, registry);
    const b = replayEpisode(ep, registry);
    if (canonicalJson(a.answer) !== canonicalJson(b.answer) || a.turns !== b.turns) {
      return { ok: false, checked, firstDivergence: ep.episodeId };
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
    const ablated = replayEpisode(origin, without(registry, id));
    if (canonicalJson(full.answer) === canonicalJson(ablated.answer)) {
      return { ok: false, offender: id, reason: "removal did not change the replayed answer (decorative)", checked };
    }
    checked++;
  }
  return { ok: true, checked };
}
