#!/bin/bash
# Download + decompress the CRAG public dev split (validation + public test
# = 2,706 records). Mirrors the SkillCraft prepare-skillcraft.sh pattern.
#
# Usage:  bash eval/crag/scripts/prepare-crag.sh
# Re-run: idempotent; skips existing files.

set -euo pipefail

# Resolve to the worktree root regardless of where this script was invoked.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
VENDOR_DIR="$ROOT/eval/crag/vendor/raw"

mkdir -p "$VENDOR_DIR"
cd "$VENDOR_DIR"

CRAG_TASK_12_URL="https://github.com/facebookresearch/CRAG/raw/refs/heads/main/data/crag_task_1_and_2_dev_v4.jsonl.bz2"
CRAG_TASK_12_BZ2="crag_task_1_and_2_dev_v4.jsonl.bz2"
CRAG_TASK_12_JSONL="crag_task_1_and_2_dev_v4.jsonl"

# ----- Download (task 1 + 2 = 705 MB) -----------------------------------
if [ -f "$CRAG_TASK_12_BZ2" ]; then
  echo "✓ $CRAG_TASK_12_BZ2 already present ($(du -h "$CRAG_TASK_12_BZ2" | cut -f1))"
else
  echo "Downloading CRAG task 1+2 dev split (705 MB) ..."
  curl -L --fail -o "$CRAG_TASK_12_BZ2" "$CRAG_TASK_12_URL"
  echo "✓ Downloaded $CRAG_TASK_12_BZ2 ($(du -h "$CRAG_TASK_12_BZ2" | cut -f1))"
fi

# ----- Decompress (task 1 + 2 → 4.8 GB jsonl) ---------------------------
if [ -f "$CRAG_TASK_12_JSONL" ]; then
  echo "✓ $CRAG_TASK_12_JSONL already present ($(du -h "$CRAG_TASK_12_JSONL" | cut -f1))"
else
  echo "Decompressing $CRAG_TASK_12_BZ2 → $CRAG_TASK_12_JSONL (will produce ~4.8 GB) ..."
  bunzip2 -k "$CRAG_TASK_12_BZ2"
  echo "✓ Decompressed $CRAG_TASK_12_JSONL ($(du -h "$CRAG_TASK_12_JSONL" | cut -f1))"
fi

# ----- Verify schema --------------------------------------------------------
RECORD_COUNT=$(wc -l < "$CRAG_TASK_12_JSONL" | tr -d ' ')
if [ "$RECORD_COUNT" -ne 2706 ]; then
  echo "✗ Expected 2,706 records, got $RECORD_COUNT — dataset may have been updated upstream"
  exit 1
fi
echo "✓ $RECORD_COUNT records (matches expected 2,706)"

# ----- Slice distribution (sanity check) ------------------------------------
echo ""
echo "Domain distribution:"
jq -r '.domain' "$CRAG_TASK_12_JSONL" | sort | uniq -c
echo ""
echo "Question type distribution:"
jq -r '.question_type' "$CRAG_TASK_12_JSONL" | sort | uniq -c
echo ""
echo "Split distribution (0 = validation, 1 = public test):"
jq -r '.split' "$CRAG_TASK_12_JSONL" | sort | uniq -c

echo ""
echo "✓ CRAG dataset ready at $VENDOR_DIR"
echo "  Next: build the adapter (P4) and the matched-arm runner."
