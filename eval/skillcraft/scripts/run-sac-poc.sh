#!/usr/bin/env bash
#
# SaC-aligned PoC arm-matrix + k-seed orchestration wrapper (S1 runner-core).
#
# Authoritative spec: kb/plans/009-sac-aligned-poc-skillcraft.md (v2).
# Binding contract:  experiments/2026-06-sac-poc/CONTRACT.md.
# Pre-registration:  experiments/2026-06-sac-poc/PRE-REGISTRATION.md.
#
# Drives the seven-arm ladder (arm0..arm5b) over k INTERLEAVED seeds
# (PRE-REGISTRATION §4: seeds are interleaved across arms, not run arm-by-arm,
# so model/infra drift spreads evenly). Two-phase arms (arm4/arm5a/arm5b) run a
# phase-1 build on LEARN_FROM_LEVELS then a phase-2 FRESH PROCESS on the held-out
# h1 sibling with a cleared transcript. arm4 phase-2 reuses the frozen library
# via --frozen-lib. Finally normalizes all runs and (if present) runs the
# cross-arm scorer.
#
# Usage:
#   eval/skillcraft/scripts/run-sac-poc.sh \
#     --families countries-explorer,random-user-database \
#     --seeds 5 \
#     --out-root eval/skillcraft/results/sac-poc/run_$(date +%Y%m%d_%H%M%S) \
#     --m0 8 \
#     [--arms arm0,arm1,arm2,arm3,arm4,arm5a,arm5b] \
#     [--model <model>] [--reasoning <effort>] [--live]
#
# Notes:
#   * --live is forwarded to the runner (the confirmatory run needs it). Without
#     --live the runner refuses to run anything but --dry-run/--fixture-smoke.
#   * Phase-1 levels are pinned by the runner (LEARN_FROM_LEVELS = e1..m2);
#     phase-2 uses h1 (--levels h1). The held-out split is pinned, not a flag.
#   * The runner sets DATAFETCH_INTERFACE_MODE / DATAFETCH_DISABLE_LEARNING from
#     SAC_ARM internally; do NOT set them here (the runner fails on conflict).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ENTRYPOINT="${ROOT}/src/eval/skillcraftFullDatafetch.ts"
NORMALIZE="${ROOT}/eval/skillcraft/scripts/normalize-results.ts"
SCORER="${ROOT}/eval/skillcraft/scripts/score-cross-arm.ts"

ARMS="arm0,arm1,arm2,arm3,arm4,arm5a,arm5b"
FAMILIES=""
SEEDS=5
OUT_ROOT="${ROOT}/eval/skillcraft/results/sac-poc/run_$(date +%Y%m%d_%H%M%S)"
M0=""
MODEL=""
REASONING=""
LIVE=""
PHASE1_LEVELS="e1,e2,e3,m1,m2"
# Held-out phase-2 reuse level. Two-phase arms (arm4/5a/5b) run it as phase-2;
# single-phase arms (arm0..3) append it after the build levels. Override with
# --reuse-level h1x to use a NEW-ARGUMENT sibling whose entities are disjoint
# from e1..m2, so the arm5a memoization floor cannot cache-hit it (R4).
REUSE_LEVEL="h1"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --arms) ARMS="$2"; shift 2;;
    --arms=*) ARMS="${1#*=}"; shift;;
    --families) FAMILIES="$2"; shift 2;;
    --families=*) FAMILIES="${1#*=}"; shift;;
    --seeds) SEEDS="$2"; shift 2;;
    --seeds=*) SEEDS="${1#*=}"; shift;;
    --out-root) OUT_ROOT="$2"; shift 2;;
    --out-root=*) OUT_ROOT="${1#*=}"; shift;;
    --m0) M0="$2"; shift 2;;
    --m0=*) M0="${1#*=}"; shift;;
    --model) MODEL="$2"; shift 2;;
    --model=*) MODEL="${1#*=}"; shift;;
    --reasoning) REASONING="$2"; shift 2;;
    --reasoning=*) REASONING="${1#*=}"; shift;;
    --reuse-level) REUSE_LEVEL="$2"; shift 2;;
    --reuse-level=*) REUSE_LEVEL="${1#*=}"; shift;;
    --live) LIVE="--live"; shift;;
    *) echo "unknown argument: $1" >&2; exit 2;;
  esac
done

if [[ -z "${FAMILIES}" ]]; then
  echo "--families is required (comma-separated family ids)" >&2
  exit 2
fi

cd "${ROOT}"
mkdir -p "${OUT_ROOT}"

# Two-phase arms run REUSE_LEVEL as their phase-2; single-phase arms append it.
PHASE2_LEVELS="${REUSE_LEVEL}"
SINGLE_LEVELS="${PHASE1_LEVELS},${REUSE_LEVEL}"

IFS=',' read -r -a ARM_ARR <<< "${ARMS}"

# B-1: seal the run-manifest BEFORE any episode runs, so the run is verifiable
# (RESEARCH-STRATEGY.md P1/P2: pin code state to a clean commit + a config_hash).
# REFUSES to launch (exit 3) on a dirty CODE tree unless DATAFETCH_ALLOW_DIRTY=1.
# Exports SAC_RUN_MANIFEST so every per-episode run-info.json links to it.
seal_args=(--out-root "${OUT_ROOT}" --arms "${ARMS}" --seeds "${SEEDS}" --families "${FAMILIES}" --reuse-level "${REUSE_LEVEL}")
[[ -n "${M0}" ]] && seal_args+=(--m0 "${M0}")
[[ -n "${MODEL}" ]] && seal_args+=(--model "${MODEL}")
[[ -n "${LIVE}" ]] && seal_args+=(--live)
pnpm tsx "${ROOT}/eval/skillcraft/scripts/seal-manifest.ts" "${seal_args[@]}" || exit $?
export SAC_RUN_MANIFEST="${OUT_ROOT}/run-manifest.json"

run_one() {
  # run_one <arm> <seed> <phase> <levels> <out-dir> [extra-args...]
  local arm="$1"; local seed="$2"; local phase="$3"; local levels="$4"; local out="$5"; shift 5
  local extra=("$@")
  echo "[sac-poc] arm=${arm} seed=${seed} phase=${phase} levels=${levels} -> ${out}"
  mkdir -p "${out}"
  local model_args=()
  [[ -n "${MODEL}" ]] && model_args+=(--model "${MODEL}")
  [[ -n "${REASONING}" ]] && model_args+=(--reasoning "${REASONING}")
  # SAC_ARM is the single authoritative selector; the runner derives the
  # interface mode + learning toggle + phase axes from it.
  SAC_ARM="${arm}" \
  pnpm tsx "${ENTRYPOINT}" \
    --families "${FAMILIES}" \
    --levels "${levels}" \
    --out-dir "${out}" \
    --phase "${phase}" \
    --seed "${seed}" \
    ${model_args[@]+"${model_args[@]}"} \
    ${LIVE} \
    ${extra[@]+"${extra[@]}"}
}

# Interleave seeds across arms (outer loop = seed, inner loop = arm) so any
# model/infra drift spreads evenly (PRE-REGISTRATION §4).
for seed in $(seq 1 "${SEEDS}"); do
  for arm in "${ARM_ARR[@]}"; do
    base="${OUT_ROOT}/${arm}/seed-${seed}"
    case "${arm}" in
      arm0|arm1|arm2|arm3)
        # Single-phase arms: run the build levels + the held-out reuse level in
        # one process (so they produce a REUSE_LEVEL episode matchable to the
        # two-phase arms' phase-2 for the cross-arm comparison).
        run_one "${arm}" "${seed}" 1 "${SINGLE_LEVELS}" "${base}/single"
        ;;
      arm4)
        # Two-phase: phase-1 build+freeze on LEARN_FROM_LEVELS, then phase-2
        # FRESH PROCESS on h1 reusing the frozen library.
        run_one "${arm}" "${seed}" 1 "${PHASE1_LEVELS}" "${base}/phase1"
        frozen="${base}/phase1/phase1-frozen"
        run_one "${arm}" "${seed}" 2 "${PHASE2_LEVELS}" "${base}/phase2" \
          --frozen-lib "${frozen}"
        ;;
      arm5a)
        # Two-phase memoization floor: phase-1 fills the results cache, phase-2
        # reuses it on held-out (new-argument) siblings (decisive hits == 0).
        cache="${base}/results-cache"
        run_one "${arm}" "${seed}" 1 "${PHASE1_LEVELS}" "${base}/phase1" \
          --results-cache-dir "${cache}"
        run_one "${arm}" "${seed}" 2 "${PHASE2_LEVELS}" "${base}/phase2" \
          --results-cache-dir "${cache}"
        ;;
      arm5b)
        # Two-phase instruction-compression floor: phase-1 distils the recipe,
        # phase-2 injects it (no callable code).
        recipes="${base}/recipes"
        run_one "${arm}" "${seed}" 1 "${PHASE1_LEVELS}" "${base}/phase1" \
          --recipe-dir "${recipes}"
        run_one "${arm}" "${seed}" 2 "${PHASE2_LEVELS}" "${base}/phase2" \
          --recipe-dir "${recipes}"
        ;;
      *)
        echo "unknown arm: ${arm}" >&2; exit 2;;
    esac
  done
done

# Normalize every produced run dir into one normalized.jsonl. Each --datafetch-run
# call appends; we accumulate by concatenating per-run normalized files.
NORMALIZED="${OUT_ROOT}/normalized.jsonl"
: > "${NORMALIZED}"
while IFS= read -r run_dir; do
  [[ -f "${run_dir}/results.json" || -f "${run_dir}/episodes.jsonl" ]] || continue
  tmp="$(mktemp)"
  pnpm tsx "${NORMALIZE}" --datafetch-run "${run_dir}" --out "${tmp}" >/dev/null
  cat "${tmp}" >> "${NORMALIZED}"
  rm -f "${tmp}"
done < <(find "${OUT_ROOT}" -type d -name "single" -o -type d -name "phase1" -o -type d -name "phase2" | sort)

echo "[sac-poc] normalized rows -> ${NORMALIZED}"

# Cross-arm scorer (S3). Optional: only run if it has landed.
if [[ -f "${SCORER}" ]]; then
  if [[ -z "${M0}" ]]; then
    echo "[sac-poc] WARNING: --m0 not set; the scorer requires the pre-registered M0. Skipping score." >&2
  else
    pnpm tsx "${SCORER}" --normalized "${NORMALIZED}" --m0 "${M0}" --out "${OUT_ROOT}/score.json" || \
      echo "[sac-poc] scorer failed (it may not be implemented yet); normalized rows are at ${NORMALIZED}" >&2
  fi
else
  echo "[sac-poc] cross-arm scorer not present yet (S3); normalized rows at ${NORMALIZED}" >&2
fi

echo "[sac-poc] done -> ${OUT_ROOT}"
