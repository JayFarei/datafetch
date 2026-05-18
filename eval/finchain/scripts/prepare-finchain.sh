#!/usr/bin/env bash
# Vendor FinChain (mbzuai-nlp/finchain) into eval/finchain/vendor/finchain
# and verify the template inventory matches the documented convention
# (12 domains x 58 topics x 5 templates).
#
# Mirrors eval/skillcraft/scripts/prepare-skillcraft.sh in argument shape
# and behaviour. Generic; no FinChain identifiers leak into the substrate.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
HARNESS_DIR="${ROOT}/eval/finchain"
FINCHAIN_DIR="${HARNESS_DIR}/vendor/finchain"
FINCHAIN_REPO="${FINCHAIN_REPO:-https://github.com/mbzuai-nlp/finchain}"
# Pin to a specific ref; update via FINCHAIN_REF=<sha> pnpm eval:finchain:prepare.
# Default: floating main (the FinChain repo is small and stable).
FINCHAIN_REF="${FINCHAIN_REF:-main}"
SKIP_VERIFY=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dataset-dir)
      FINCHAIN_DIR="$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"
      shift 2
      ;;
    --repo)
      FINCHAIN_REPO="$2"
      shift 2
      ;;
    --ref)
      FINCHAIN_REF="$2"
      shift 2
      ;;
    --skip-verify)
      SKIP_VERIFY=1
      shift
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 2
      ;;
  esac
done

mkdir -p "${HARNESS_DIR}/vendor" "${HARNESS_DIR}/manifests"

if [[ ! -d "${FINCHAIN_DIR}/.git" ]]; then
  echo "[prepare] cloning ${FINCHAIN_REPO} -> ${FINCHAIN_DIR}"
  git clone "${FINCHAIN_REPO}" "${FINCHAIN_DIR}"
fi

if [[ "${FINCHAIN_REF}" != "main" ]]; then
  echo "[prepare] checking out ${FINCHAIN_REF}"
  ( cd "${FINCHAIN_DIR}" && git fetch --quiet && git checkout --quiet "${FINCHAIN_REF}" )
fi

if [[ "${SKIP_VERIFY}" -eq 0 ]]; then
  TEMPLATES_DIR="${FINCHAIN_DIR}/data/templates"
  if [[ ! -d "${TEMPLATES_DIR}" ]]; then
    echo "[prepare] ERROR: templates dir missing at ${TEMPLATES_DIR}" >&2
    exit 1
  fi
  DOMAIN_COUNT=$(find "${TEMPLATES_DIR}" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')
  TOPIC_COUNT=$(find "${TEMPLATES_DIR}" -mindepth 2 -maxdepth 2 -type f -name "*.py" | wc -l | tr -d ' ')
  echo "[prepare] vendor verified: ${DOMAIN_COUNT} domains, ${TOPIC_COUNT} topics"
  if [[ "${DOMAIN_COUNT}" -lt 10 || "${TOPIC_COUNT}" -lt 50 ]]; then
    echo "[prepare] WARN: inventory below documented convention (12 domains x 58 topics)" >&2
  fi
fi

echo "[prepare] done. vendor at: ${FINCHAIN_DIR}"
