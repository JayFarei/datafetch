// Procedure registry: maps procedureId → runnable Procedure. Built from the
// curated seeds (lib/seeds/) plus, optionally, the negative-control fixtures.
// Ablation (V6) works by producing a registry with one procedure removed.

import { CONTROL_PROCEDURES } from "./controls.js";
import type { Procedure } from "./executor.js";
import { seedProcedure, type Seed } from "./seed.js";
import { tasksForTenant } from "./tasks.js";

import { alphaOpenHighCount } from "../../lib/seeds/alpha-open-high-count.js";
import { alphaOpenTopics } from "../../lib/seeds/alpha-open-topics.js";
import { betaDeliveredSum } from "../../lib/seeds/beta-delivered-sum.js";
import { betaOpenRegions } from "../../lib/seeds/beta-open-regions.js";

export const SEEDS: Seed[] = [
  alphaOpenHighCount,
  alphaOpenTopics,
  betaDeliveredSum,
  betaOpenRegions,
];

export function getSeed(id: string): Seed | undefined {
  return SEEDS.find((s) => s.id === id);
}

export function seedsForTenant(tenant: string): Seed[] {
  const taskIds = new Set(tasksForTenant(tenant).map((t) => t.id));
  return SEEDS.filter((s) => taskIds.has(s.taskId));
}

export interface RegistryOptions {
  withControls?: boolean;
}

export function buildRegistry(opts: RegistryOptions = {}): Map<string, Procedure> {
  const map = new Map<string, Procedure>();
  for (const seed of SEEDS) map.set(seed.id, seedProcedure(seed));
  if (opts.withControls) {
    for (const ctl of CONTROL_PROCEDURES) map.set(ctl.id, ctl);
  }
  return map;
}

/** A copy of the registry with one procedure removed (ablation). */
export function without(
  registry: ReadonlyMap<string, Procedure>,
  id: string,
): Map<string, Procedure> {
  const copy = new Map(registry);
  copy.delete(id);
  return copy;
}
