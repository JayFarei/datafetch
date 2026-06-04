#!/usr/bin/env bash
# Launches N parallel sharded skillcraft evals, each over a disjoint
# family slice. Each shard writes to <base-out>-shard{N}. After all
# shards finish, normalized.jsonl / helper-instrumentation.jsonl /
# intent-clusters.json / r1-r9-scorecard.json / fanout-slot-diagnostics.json
# can be re-computed against an aggregated copy via scripts/merge-shards.ts
# (created on demand) — for now, run diagnostics per shard and inspect
# results.partial.json per shard.
#
# Env passthrough: DATAFETCH_AGENT, CLAUDE_CLI, DF_SKILLCRAFT_CLAUDE_*, etc.
# Usage:
#   bash scripts/parallel-eval.sh <base-out-name> <shard-count> [extra-eval-flags...]
# Example:
#   CLAUDE_CLI=claude-p DATAFETCH_AGENT=claude DF_SKILLCRAFT_CLAUDE_MODEL=claude-sonnet-4-6 \
#     bash scripts/parallel-eval.sh goal4-iter165-claudep-full126 4

set -e

BASE_OUT_NAME="$1"
SHARD_COUNT="${2:-4}"
shift 2 || true
EXTRA_FLAGS=("$@")

if [[ -z "$BASE_OUT_NAME" ]]; then
  echo "usage: $0 <base-out-name> <shard-count> [extra-eval-flags...]" >&2
  exit 1
fi

FAMILIES=(
  cat-facts-collector cocktail-menu-generator countries-encyclopedia
  dnd-campaign-builder dnd-monster-compendium dog-breeds-encyclopedia
  gitlab-deep-analysis jikan-anime-analysis jsonplaceholder-blog-analyzer
  local-dna-analysis name-demographics-analyzer openmeteo-weather
  pokeapi-pokedex random-user-database recipe-cookbook-builder
  rickmorty-multiverse-explorer tvmaze-series-analyzer
  university-directory-builder usgs-earthquake-monitor
  vocabulary-builder world-bank-economic-snapshot
)
N=${#FAMILIES[@]}

OUT_BASE="eval/skillcraft/results/datafetch"
mkdir -p "$OUT_BASE"

# Round-robin family distribution across shards so workload (heavy
# families) spreads evenly.
declare -a SHARD_FAMILIES
for ((i=0; i<SHARD_COUNT; i++)); do
  SHARD_FAMILIES[$i]=""
done
for ((i=0; i<N; i++)); do
  s=$(( i % SHARD_COUNT ))
  if [[ -n "${SHARD_FAMILIES[$s]}" ]]; then
    SHARD_FAMILIES[$s]+=,
  fi
  SHARD_FAMILIES[$s]+="${FAMILIES[$i]}"
done

declare -a PIDS
for ((s=0; s<SHARD_COUNT; s++)); do
  fams="${SHARD_FAMILIES[$s]}"
  out_dir="$OUT_BASE/${BASE_OUT_NAME}-shard${s}"
  log_file="$out_dir.launch.log"
  echo "shard $s families=$fams out=$out_dir"
  mkdir -p "$out_dir"
  pnpm eval:skillcraft -- --live \
    --families "$fams" \
    --out-dir "$out_dir" \
    --timeout-ms 300000 \
    "${EXTRA_FLAGS[@]}" \
    >"$log_file" 2>&1 &
  PIDS+=($!)
  # Small jitter between shard launches to avoid stampeding the API auth.
  sleep 2
done

echo "launched ${#PIDS[@]} shards: ${PIDS[*]}"
echo "wait for completion..."
fail=0
for pid in "${PIDS[@]}"; do
  if ! wait "$pid"; then
    echo "shard pid=$pid FAILED" >&2
    fail=1
  fi
done
exit "$fail"
