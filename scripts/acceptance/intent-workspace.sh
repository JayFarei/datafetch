#!/usr/bin/env bash
# scripts/acceptance/intent-workspace.sh
#
# Direct no-LLM acceptance test for the VFS-mounted intent workspace flow:
#   mount -> run scratch -> commit answer.ts -> result/* + commit history/tests

set -euo pipefail

LIB_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )/lib"
# shellcheck disable=SC1091
source "$LIB_DIR/common.sh"

trap teardown EXIT

setup_dataplane --no-publish

WORKSPACE="$DATAFETCH_HOME/intent-workspace"

step "mounting intent workspace"
dft mount \
  --tenant test-jay \
  --dataset finqa-2024 \
  --intent "Use a seed primitive to prove commit writes a structured answer" \
  --path "$WORKSPACE" \
  >/tmp/datafetch-intent-workspace.out

assert_file_exists "$WORKSPACE/AGENTS.md" "workspace AGENTS.md"
assert_file_exists "$WORKSPACE/CLAUDE.md" "workspace CLAUDE.md"
assert_file_exists "$WORKSPACE/df.d.ts" "workspace df.d.ts"
assert_file_exists "$WORKSPACE/scripts/scratch.ts" "workspace scratch.ts"
assert_file_exists "$WORKSPACE/scripts/answer.ts" "workspace answer.ts"
assert_file_exists "$WORKSPACE/scripts/helpers.ts" "workspace helpers.ts"
assert_file_exists "$WORKSPACE/.datafetchignore" "workspace datafetchignore"
assert_file_exists "$WORKSPACE/.datafetch/workspace.json" "workspace metadata"
assert_eq '/// <reference path="../df.d.ts" />' "$(head -n 1 "$WORKSPACE/scripts/scratch.ts")" "scratch.ts references df.d.ts"
assert_eq '/// <reference path="../df.d.ts" />' "$(head -n 1 "$WORKSPACE/scripts/answer.ts")" "answer.ts references df.d.ts"
assert_eq '/// <reference path="../df.d.ts" />' "$(head -n 1 "$WORKSPACE/scripts/helpers.ts")" "helpers.ts references df.d.ts"

step "running exploratory scratch script"
cat > "$WORKSPACE/scripts/scratch.ts" <<'EOF'
const out = await df.lib.arithmeticDivide({ numerator: 6, denominator: 3 });
console.log(JSON.stringify({ quotient: out.value.quotient }));
EOF
(
  cd "$WORKSPACE"
  dft run scripts/scratch.ts > "$DATAFETCH_HOME/run.out"
)
assert_file_exists "$WORKSPACE/tmp/runs/001/source.ts" "run source artifact"
assert_file_exists "$WORKSPACE/tmp/runs/001/result.json" "run result artifact"
assert_file_exists "$WORKSPACE/tmp/runs/001/lineage.json" "run lineage artifact"
assert_file_exists "$WORKSPACE/tmp/runs/001/graph.txt" "run readable trajectory graph"
assert_json_field "$WORKSPACE/tmp/runs/001/result.json" ".phase" "run" "run phase"

step "committing visible answer program"
mkdir -p "$WORKSPACE/lib/skills" "$WORKSPACE/tmp"
cat > "$WORKSPACE/lib/localHelper.ts" <<'EOF'
export function localHelper() {
  return "visible dependency";
}
EOF
cat > "$WORKSPACE/lib/skills/pick_evidence.md" <<'EOF'
# Pick Evidence

Return JSON only.
EOF
printf 'ignored\n' > "$WORKSPACE/tmp/debug.txt"
cat > "$WORKSPACE/scripts/answer.ts" <<'EOF'
const out = await df.lib.arithmeticDivide({ numerator: 6, denominator: 3 });
return df.answer({
  status: "answered",
  value: out.value.quotient,
  unit: "ratio",
  evidence: [{ ref: "df.lib.arithmeticDivide" }],
  coverage: { exact: true },
  derivation: {
    operation: "divide",
    values: [6, 3],
  },
});
EOF
(
  cd "$WORKSPACE"
  dft commit scripts/answer.ts > "$DATAFETCH_HOME/commit.out"
)
assert_file_exists "$WORKSPACE/result/source.ts" "commit source artifact"
assert_file_exists "$WORKSPACE/result/answer.md" "commit answer markdown"
assert_file_exists "$WORKSPACE/result/answer.json" "commit answer json"
assert_file_exists "$WORKSPACE/result/validation.json" "commit validation json"
assert_file_exists "$WORKSPACE/result/lineage.json" "commit lineage json"
assert_file_exists "$WORKSPACE/result/graph.txt" "commit readable trajectory graph"
assert_file_exists "$WORKSPACE/result/report.md" "commit readable aggregate report"
assert_file_exists "$WORKSPACE/result/HEAD.json" "commit HEAD pointer"
assert_file_exists "$WORKSPACE/result/tests/replay.json" "commit replay test"
assert_file_exists "$WORKSPACE/result/tests/replay.txt" "commit readable replay summary"
assert_file_exists "$WORKSPACE/result/workspace/manifest.json" "commit workspace snapshot manifest"
assert_file_exists "$WORKSPACE/result/workspace/files/scripts/answer.ts" "commit workspace snapshot answer source"
assert_file_exists "$WORKSPACE/result/workspace/files/lib/localHelper.ts" "commit workspace snapshot lib helper"
assert_file_exists "$WORKSPACE/result/workspace/files/lib/skills/pick_evidence.md" "commit workspace snapshot skill sidecar"
assert_file_exists "$WORKSPACE/result/commits/001/answer.json" "commit history answer"
assert_file_exists "$WORKSPACE/result/commits/001/graph.txt" "commit history trajectory graph"
assert_file_exists "$WORKSPACE/result/commits/001/report.md" "commit history aggregate report"
assert_file_exists "$WORKSPACE/result/commits/001/tests/replay.json" "commit history replay test"
assert_file_exists "$WORKSPACE/result/commits/001/tests/replay.txt" "commit history replay summary"
assert_file_exists "$WORKSPACE/result/commits/001/workspace/manifest.json" "commit history workspace snapshot"
assert_json_field "$WORKSPACE/result/answer.json" ".status" "answered" "answer status"
assert_json_field "$WORKSPACE/result/answer.json" ".value" "2" "answer value"
assert_json_field "$WORKSPACE/result/validation.json" ".accepted" "true" "commit accepted"
assert_json_field "$WORKSPACE/result/HEAD.json" ".commit" "001" "HEAD points to first accepted commit"
assert_json_field "$WORKSPACE/result/HEAD.json" ".sourceSnapshotPath" "source.ts" "HEAD points at committed source snapshot"
assert_json_truthy "$WORKSPACE/result/HEAD.json" '.sourceHash | test("^[0-9a-f]{64}$")' "HEAD records committed source hash"
assert_json_field "$WORKSPACE/result/HEAD.json" ".graphPath" "graph.txt" "HEAD points at readable graph"
assert_json_field "$WORKSPACE/result/HEAD.json" ".reportPath" "report.md" "HEAD points at readable report"
assert_json_field "$WORKSPACE/result/HEAD.json" ".observerDecisionLogPath" "observer/test-jay/decisions.jsonl" "HEAD points at observer decision log"
assert_json_field "$WORKSPACE/result/HEAD.json" ".replaySummaryPath" "tests/replay.txt" "HEAD points at readable replay"
assert_json_field "$WORKSPACE/result/tests/replay.json" ".expected.value" "2" "replay expected answer value"
assert_json_field "$WORKSPACE/result/tests/replay.json" ".sourceSnapshotPath" "source.ts" "replay points at source snapshot"
assert_json_truthy "$WORKSPACE/result/tests/replay.json" '.sourceHash | test("^[0-9a-f]{64}$")' "replay records source hash"
assert_json_field "$WORKSPACE/result/tests/replay.json" ".expected.assumptionsPresent" "false" "replay records assumption presence"
assert_json_field "$WORKSPACE/result/tests/replay.json" ".learning.eligible" "true" "replay records learning eligibility"
assert_json_field "$WORKSPACE/result/tests/replay.json" ".learning.observerDecision" "not-recorded-in-workspace-response" "replay records observer decision status"
assert_json_field "$WORKSPACE/result/tests/replay.json" ".learning.observerDecisionLogPath" "observer/test-jay/decisions.jsonl" "replay records observer decision log"
assert_json_field "$WORKSPACE/result/tests/replay.json" ".learning.callabilityAuthority" "hook-manifest" "replay records callability authority"
assert_json_field "$WORKSPACE/result/workspace/manifest.json" '.files | map(.path) | index("scripts/answer.ts") != null' "true" "snapshot records answer.ts"
assert_json_field "$WORKSPACE/result/workspace/manifest.json" '.files | map(.path) | index("lib/skills/pick_evidence.md") != null' "true" "snapshot records skill sidecar"
assert_json_field "$WORKSPACE/result/workspace/manifest.json" '.files | map(.path) | index("tmp/debug.txt") == null' "true" "snapshot ignores tmp debug"
ACCEPTED_HEAD="$(jq -r '.trajectoryId // empty' "$WORKSPACE/result/HEAD.json")"

if jq -e '.calls[]? | select(.primitive == "lib.arithmeticDivide")' "$WORKSPACE/result/lineage.json" >/dev/null; then
  printf '[PASS] commit lineage records df.lib.arithmeticDivide\n'
  PASS_COUNT=$((PASS_COUNT + 1))
else
  printf '[FAIL] commit lineage missing df.lib.arithmeticDivide\n' >&2
  FAIL_COUNT=$((FAIL_COUNT + 1))
fi
if rg -q "compute lib.arithmeticDivide" "$WORKSPACE/result/graph.txt" && rg -q "write df.answer" "$WORKSPACE/result/graph.txt"; then
  printf '[PASS] commit graph shows compute and answer write\n'
  PASS_COUNT=$((PASS_COUNT + 1))
else
  printf '[FAIL] commit graph missing compute or answer write\n' >&2
  cat "$WORKSPACE/result/graph.txt" >&2 || true
  FAIL_COUNT=$((FAIL_COUNT + 1))
fi
if rg -q "workspace replay" "$WORKSPACE/result/tests/replay.txt" && rg -q "sourceSnapshot: source.ts" "$WORKSPACE/result/tests/replay.txt" && rg -q "sourceHash: [0-9a-f]{64}" "$WORKSPACE/result/tests/replay.txt" && rg -q "assumptionsPresent: false" "$WORKSPACE/result/tests/replay.txt" && rg -q "observerDecision: not-recorded-in-workspace-response" "$WORKSPACE/result/tests/replay.txt" && rg -q "observerDecisionLog: observer/test-jay/decisions.jsonl" "$WORKSPACE/result/tests/replay.txt"; then
  printf '[PASS] commit replay summary is readable\n'
  PASS_COUNT=$((PASS_COUNT + 1))
else
  printf '[FAIL] commit replay summary missing expected lines\n' >&2
  cat "$WORKSPACE/result/tests/replay.txt" >&2 || true
  FAIL_COUNT=$((FAIL_COUNT + 1))
fi
if rg -q "datafetch workspace report" "$WORKSPACE/result/report.md" && rg -q "sourceHash: [0-9a-f]{64}" "$WORKSPACE/result/report.md" && rg -q "accepted: true" "$WORKSPACE/result/report.md" && rg -q "crystallisable: true" "$WORKSPACE/result/report.md" && rg -q "observerDecision: not-recorded-in-workspace-response" "$WORKSPACE/result/report.md" && rg -q "observerDecisionLog: observer/test-jay/decisions.jsonl" "$WORKSPACE/result/report.md" && rg -q "callabilityAuthority: hook-manifest" "$WORKSPACE/result/report.md" && rg -q "compute lib.arithmeticDivide" "$WORKSPACE/result/report.md"; then
  printf '[PASS] commit aggregate report is readable\n'
  PASS_COUNT=$((PASS_COUNT + 1))
else
  printf '[FAIL] commit aggregate report missing expected lines\n' >&2
  cat "$WORKSPACE/result/report.md" >&2 || true
  FAIL_COUNT=$((FAIL_COUNT + 1))
fi

step "rejecting private/plain answer"
cat > "$WORKSPACE/scripts/answer.ts" <<'EOF'
console.log("2");
EOF
(
  cd "$WORKSPACE"
  if dft commit scripts/answer.ts > "$DATAFETCH_HOME/reject.out" 2>&1; then
    printf '[FAIL] plain commit unexpectedly succeeded\n' >&2
    FAIL_COUNT=$((FAIL_COUNT + 1))
  else
    printf '[PASS] plain commit rejected\n'
    PASS_COUNT=$((PASS_COUNT + 1))
  fi
)
assert_json_field "$WORKSPACE/result/validation.json" ".accepted" "true" "rejected commit leaves accepted validation current"
assert_json_field "$WORKSPACE/result/answer.json" ".value" "2" "rejected commit leaves accepted answer current"
assert_file_exists "$WORKSPACE/result/commits/002/validation.json" "rejected commit history validation"
assert_json_field "$WORKSPACE/result/commits/002/validation.json" ".accepted" "false" "rejected attempt is recorded in commit history"
assert_json_field "$WORKSPACE/result/HEAD.json" ".trajectoryId" "$ACCEPTED_HEAD" "rejected commit does not advance HEAD"

printf '\nintent-workspace acceptance: %s passed, %s failed\n' "$PASS_COUNT" "$FAIL_COUNT"
if (( FAIL_COUNT > 0 )); then
  exit 1
fi
