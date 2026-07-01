# Ladder demo — learning dashboard

_Driver: `scripted` (deterministic policy over real mounted fixtures). Every turn count below is MEASURED by the executor, never a constant. Commit stamped on episodes: `433d26233d502f7d17b620134e091df320386997`._

This is NOT a claim that helpers beat inline for a frontier model, nor that agent-authored procedures promote under live traffic (plan 016 P4, open). It shows the ladder MECHANICS working end to end on two schema-distinct tenants.

## Per-user learning (promoted sets diverge)

Each tenant climbs the ladder on its OWN traffic, so the promoted sets are different:

| Tenant | Corpus | Promoted | Rejected at gate |
|---|---|---|---|
| **alpha** | support-tickets | `alpha-open-high-count`, `alpha-open-topics-index` | `shallow-control`, `degenerate-control` |
| **beta** | orders | `beta-delivered-sum`, `beta-open-regions-index` | `alpha-open-high-count` |

The gate is live in **both** directions: negative controls reach the boundary and are rejected; real procedures cross it and promote. That is the anti-inert invariant (the 0/22 lesson).

## System learning (cross-tenant suggestion, earn-or-stay-put)

After alpha promotes, its winner is offered into beta's quarantine. Governance is per-tenant and evidence-gated, so a suggestion must earn promotion from beta's own paired wins — reputation does not leak:

- `alpha-open-high-count` (suggested from **alpha**): stayed put — beta's gate declined it (no matching index/schema, never won a pair)

## DL-per-intent (measured cost, inline vs library)

"DL" here is the per-call cost proxy = executor turns. Inline = masked-arm scan; exposed = library-backed index read.

### alpha
| Intent | Kind | Inline turns | Exposed turns | Turns saved |
|---|---|---|---|---|
| `alpha-open-high` | count | 3 | 1 | 2 |
| `alpha-open-topics` | list | 3 | 1 | 2 |

### beta
| Intent | Kind | Inline turns | Exposed turns | Turns saved |
|---|---|---|---|---|
| `beta-delivered-sum` | count | 3 | 1 | 2 |
| `beta-open-regions` | list | 3 | 1 | 2 |

## Inline-rederivation falls with usage

Once a procedure crosses the boundary, the intent it serves no longer needs inline rederivation on subsequent traffic. Cumulative inline turns avoided post-promotion: **alpha 60**, **beta 60**. Full per-episode curve in `curves.json` (`tenants.<t>.inlineRederivationCurve`).

## Composition depth

Max promoted-procedure lineage depth: **alpha 1**, **beta 1** (single-index seeds; deeper composition is future work).

## Controls, drift, floor

- Negative controls held (never promoted): `shallow-control`, `degenerate-control`.
- Forced-drift probe on `stale-clone-control`: `promoted` → `quarantine`, abstention recorded = true. Both edges OBSERVED by running the probe (mutate snapshot → next episode abstains → demote).
- Graceful floor probe: maskedServeOk = true, driftAbstained = true. With the library fully masked the product still serves typed answers and abstains under drift.

_Regenerate: `pnpm ladder:demo`. Acceptance gate: `./verify/ladder.sh eval/ladder/runs/demo`._
