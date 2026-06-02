# experiments/2026-06-sac-poc/

The SaC-aligned proof-of-value PoC on SkillCraft: a pre-registered
break-even amortisation result plus a governed-promotion co-pillar,
extending the existing SkillCraft datafetch harness with the six-arm ladder
no skill-memory paper has run.

Perplexity shipped Search as Code (SaC), the code-mode-over-a-data-plane
thesis at production scale, and proved the amortisation axis is real (CVE
case study, -85.1% tokens). SaC keeps task helpers **ephemeral** (re-pays
codegen every trajectory, no cross-session persistence, no governance
contract for auto-generated code). This PoC lands the runnable proof that
datafetch's online per-tenant **governed crystallisation** amortises that
recurring codegen cost below a realistic tenant reuse density, and that a
held-out-replay gate declines instead of answering confidently wrong.

## What this is (and is not)

- **Headline proof object:** a pre-registered results table — the break-even
  `M*` (reuse count to pay back build + governance cost) with its 95% upper
  CI against a pre-registered `M0`, SaC annotated at `M* = infinity`.
- **Co-primary:** the attribution ladder — arm4 (callable typed helper) must
  beat BOTH arm5a (memoization floor) AND arm5b (instruction-compression
  floor) on model-context tokens at non-inferior correctness.
- **Co-pillar:** governance — arm2 (governed) vs arm3 (ungoverned) plus three
  deterministic replay probes and a blind 20+20 mini-suite.
- **NOT** a single-session correctness claim. That null is pre-registered
  (frontier reuse of a small re-derivable helper fires ~0 times).
- **NOT** a generality claim. SkillCraft was chosen post-hoc because reuse is
  structurally necessary (R7 = 0.846); this is disclosed.

## The arm ladder (R3)

| Arm | Role |
|-----|------|
| arm0 | no-tools floor |
| arm1 | tool-matched inline-rewrite, no persistence (the adversarial bar; SaC's regime) |
| arm2 | datafetch governed library (replay PASS flips callability) |
| arm3 | ablation: crystallise + callable but SKIP the replay gate |
| arm4 | frozen-library cross-session (phase-1 build+freeze, phase-2 fresh process) — OUR CLAIM |
| arm5a | results-cache-only (memoization floor) |
| arm5b | recipe-only (instruction-compression floor) |

## Documents

- [`CONTRACT.md`](./CONTRACT.md) — the binding interface contract for all
  four build streams: arm selector + episode schema + M* formula +
  prompt-parity-hash + file-ownership map + governance-probe reuse. **Read
  this before writing any code.**
- [`PRE-REGISTRATION.md`](./PRE-REGISTRATION.md) — `M0`, the attribution
  rule, the clustered-correctness NI rule (-5pp), the k≥5 seed protocol, and
  the qualitative governance scope. Frozen before the confirmatory run.
- [`STATUS.md`](./STATUS.md) — current phase and per-stream progress.

## Relation to the rest of the repo

- Spec: `kb/plans/009-sac-aligned-poc-skillcraft.md` (v2).
- Background: `kb/br/20-perplexity-search-as-code.md`,
  `kb/br/19-...baseline-ladder...`, `kb/br/16-...benchmark-selection`,
  `kb/br/17-crag-shape-probe-findings`.
- Harness extended: `src/eval/skillcraftFullDatafetch.ts`.
- New scorer: `eval/skillcraft/scripts/score-cross-arm.ts` (does NOT extend
  the intra-arm `score-r1-r9.ts`).
- Reused substrate (no behaviour change): `src/observer/quarantineValidator.ts`
  (numeric FAC replay), `src/hooks/{mode,registry}.ts` (interface modes).

This directory follows the canonical experiment layout (see
`experiments/README.md`): session-level working notes, distinct from public
`docs/` and from the `eval/` benchmark harness.
