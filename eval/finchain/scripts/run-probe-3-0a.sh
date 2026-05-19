#!/usr/bin/env bash
# iter 3.0a probe: hand-crafted helper bilateral.
#
# Runs 4 seeds × investment_analysis/ci tpl4 (Intermediate, semi-annual
# compounding with mid-term rate change) under two arms:
#   - control:  no helper preseeded
#   - helper:   eval/finchain/preseed-rich-helper/ci_two_phase_semiannual.ts dropped into the
#               per-family tenant lib dir, surfaced in AGENTS.md + df.d.ts
#
# Both arms have observer learning disabled (DATAFETCH_DISABLE_LEARNING=1) —
# the probe measures whether the agent CALLS a ready helper, not whether the
# observer can author one. If the agent doesn't call the helper, the
# substrate's "agent calls learned interfaces" premise does not fit FinChain
# regardless of authoring genericity, and iter 3 halts.

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

PRESEED_DIR="$(pwd)/eval/finchain/preseed-rich-helper"

if [[ ! -f "$PRESEED_DIR/ci_two_phase_semiannual.ts" ]]; then
  echo "[probe-3-0a] preseed helper missing at $PRESEED_DIR" >&2
  exit 1
fi

LABEL_CONTROL="probe-3-0a-control"
LABEL_HELPER="probe-3-0a-helper"

echo "[probe-3-0a] arm 1: control (no preseed helper)"
DATAFETCH_DISABLE_LEARNING=1 pnpm eval:finchain --live \
  --topics investment_analysis/ci \
  --templates 4 \
  --seed-indices 0,1,2,3 \
  --label "$LABEL_CONTROL"

echo "[probe-3-0a] arm 2: helper (preseed enabled)"
DATAFETCH_DISABLE_LEARNING=1 pnpm eval:finchain --live \
  --topics investment_analysis/ci \
  --templates 4 \
  --seed-indices 0,1,2,3 \
  --label "$LABEL_HELPER" \
  --preseed-helper-dir "$PRESEED_DIR"

echo "[probe-3-0a] analyzing"
tsx eval/finchain/scripts/analyze-probe-3-0a.ts \
  --control "eval/finchain/results/datafetch/$LABEL_CONTROL" \
  --helper  "eval/finchain/results/datafetch/$LABEL_HELPER" \
  --out     "eval/finchain/results/datafetch/$LABEL_HELPER/probe-3-0a-verdict.json"

echo "[probe-3-0a] done"
