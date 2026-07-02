#!/usr/bin/env bash
# Grounded verifier for the online promotion ladder (kb/plans/016).
# Re-observes run artifacts only. Never reads agent narration.
# Verdict lines: CHECK:<id> <GREEN|RED|BLOCK> <reason>
# Exit 0 iff every check is GREEN. BLOCK is never a pass.
set -u

RUN_DIR="${1:-runs/ladder}"
PREREG="prereg/ladder-boundaries.json"
EPISODES="$RUN_DIR/episodes.jsonl"
STATE="$RUN_DIR/ladder-state.json"
PROMOTIONS="$RUN_DIR/promotions.jsonl"
REPLAY_BIN="${REPLAY_BIN:-bin/ladder-replay}"   # the P0 executor; BLOCK until it exists
FAIL=0

verdict() { # id status reason
  echo "CHECK:$1 $2 $3"
  [ "$2" = "GREEN" ] || FAIL=1
}

need() { # high-assurance precondition: absence is BLOCK, never a skip
  [ -e "$1" ] && return 0
  verdict "$2" BLOCK "precondition absent: $1"
  return 1
}

command -v jq >/dev/null || { echo "CHECK:V-1 BLOCK jq missing (verifier broken, not a pass)"; exit 2; }

# ---------- V9 tamper guard runs FIRST: do not read verdicts off a weakened grader ----------
if [ -f verify/.checksums ]; then
  if (cd verify && sha256sum -c .checksums --quiet 2>/dev/null); then
    verdict V9 GREEN "verifier and fixtures match pinned checksums"
  else
    verdict V9 RED "verifier or fixtures tampered (checksum mismatch)"
  fi
else
  verdict V9 RED "verify/.checksums missing: assertions unpinned"
fi

# ---------- V0 prereg ancestry (D7): boundaries committed before the first episode ----------
if need "$PREREG" V0 && need "$EPISODES" V0; then
  prereg_commit=$(git log --diff-filter=A --format=%H -1 -- "$PREREG")
  first_commit=$(head -1 "$EPISODES" | jq -r '.commit // empty')
  if [ -z "$prereg_commit" ] || [ -z "$first_commit" ]; then
    verdict V0 RED "cannot resolve prereg commit or first-episode commit"
  elif git merge-base --is-ancestor "$prereg_commit" "$first_commit" 2>/dev/null; then
    rt_hash=$(jq -cS . "$PREREG" | shasum -a 256 | cut -d' ' -f1)
    used_hash=$(head -1 "$EPISODES" | jq -r '.preregHash // empty')
    [ "$rt_hash" = "$used_hash" ] \
      && verdict V0 GREEN "prereg predates first episode and hash matches runtime" \
      || verdict V0 RED "runtime prereg hash != committed prereg (boundary tampering)"
  else
    verdict V0 RED "prereg committed AFTER first episode (peeking)"
  fi
fi

# ---------- V1 typed answers (D9, C1) ----------
if need "$EPISODES" V1; then
  bad=$(jq -s '[.[] | select(.answerSchemaOk != true)] | length' "$EPISODES")
  total=$(jq -s 'length' "$EPISODES")
  if [ "$total" -eq 0 ]; then verdict V1 RED "zero episodes: nothing verified"
  elif [ "$bad" -eq 0 ]; then
    # adversarial fixture must have been REJECTED, not absent (a skip can hide a lie)
    rej=$(jq -s '[.[] | select(.fixture == "prose-in-string" and .contractRejected == true)] | length' "$EPISODES")
    [ "$rej" -ge 1 ] \
      && verdict V1 GREEN "$total episodes schema-valid; prose-in-string fixture rejected" \
      || verdict V1 RED "no evidence the contract can reject (prose-in-string fixture never ran red)"
  else verdict V1 RED "$bad/$total episodes fail the typed-answer contract"; fi
fi

# ---------- V2 replay determinism (C1) ----------
if [ -x "$REPLAY_BIN" ]; then
  if "$REPLAY_BIN" --self-test --double-run >/dev/null 2>&1; then
    verdict V2 GREEN "double-run replay byte-identical on pinned commits"
  else
    verdict V2 RED "replay non-deterministic or failing"
  fi
else
  verdict V2 BLOCK "replay executor absent ($REPLAY_BIN): C1 unprovable"
fi

# ---------- V3 pair integrity + masking (D4, D5, C2) ----------
if need "$EPISODES" V3 && need "$PREREG" V3; then
  win=$(jq -r '.pairWindowSec' "$PREREG")
  badpairs=$(jq -s --argjson w "$win" '
    [group_by(.pairId)[] | select(.[0].pairId != null) |
     select(length != 2
       or .[0].query != .[1].query
       or .[0].snapshotHash != .[1].snapshotHash
       or ((.[0].ts - .[1].ts) | fabs) > $w
       or ([.[].arm] | sort) != ["exposed","masked"])] | length' "$EPISODES")
  npairs=$(jq -s '[group_by(.pairId)[] | select(.[0].pairId != null)] | length' "$EPISODES")
  if [ "$npairs" -eq 0 ]; then verdict V3 RED "zero shadow pairs recorded"
  elif [ "$badpairs" -gt 0 ]; then verdict V3 RED "$badpairs/$npairs pairs violate same-query/same-snapshot/window/alternation"
  else
    leak=0; missing=0
    while IFS= read -r p; do
      if [ -f "$p" ]; then grep -qE 'df\.lib|apropos|df\.d\.ts|\bman\(' "$p" && leak=$((leak+1)); else missing=$((missing+1)); fi
    done < <(jq -r 'select(.arm=="masked") | .promptPath' "$EPISODES")
    if [ "$missing" -gt 0 ]; then verdict V3 RED "$missing masked prompts not on disk (cannot re-observe masking)"
    elif [ "$leak" -gt 0 ]; then verdict V3 RED "$leak masked prompts leak library surface (counterfactual void)"
    else verdict V3 GREEN "$npairs pairs well-formed; masked prompts contain zero library tokens"; fi
  fi
fi

# ---------- V4 negative controls + drift edges + anti-inert gate (D2, D3, C3) ----------
if need "$STATE" V4; then
  for ctl in shallow-control degenerate-control; do
    st=$(jq -r --arg c "$ctl" '.[$c].state // "ABSENT"' "$STATE")
    case "$st" in
      ABSENT)   verdict "V4:$ctl" RED "control fixture missing from ladder (unproven red-capability)";;
      promoted) verdict "V4:$ctl" RED "NEGATIVE CONTROL PROMOTED: gate broken";;
      *)        verdict "V4:$ctl" GREEN "control held at $st";;
    esac
  done
  # drift: must observe BOTH edges of the forced transition
  pre=$(jq -r '.["stale-clone-control"].driftProbe.stateBeforeMutation // empty' "$STATE")
  post=$(jq -r '.["stale-clone-control"].driftProbe.stateAfterNextEpisode // empty' "$STATE")
  abst=$(jq -r '.["stale-clone-control"].driftProbe.abstentionRecorded // false' "$STATE")
  if [ "$pre" = "promoted" ] && [ "$post" = "quarantine" ] && [ "$abst" = "true" ]; then
    verdict V4:drift GREEN "forced drift observed on both edges: promoted -> quarantine + abstention"
  else
    verdict V4:drift RED "drift demotion not observed (pre=$pre post=$post abstention=$abst)"
  fi
  # anti-inert (the 0/22 lesson): a gate that never rejects, or never passes, is unproven
  if need "$PROMOTIONS" V4:inert; then
    rejects=$(jq -s '[.[] | select(.decision=="reject")] | length' "$PROMOTIONS")
    passes=$(jq -s '[.[] | select(.decision=="promote")] | length' "$PROMOTIONS")
    if [ "$rejects" -gt 0 ] && [ "$passes" -gt 0 ]; then
      verdict V4:inert GREEN "gate has both rejected ($rejects) and promoted ($passes): live in both directions"
    else
      verdict V4:inert RED "gate inert in one direction (rejects=$rejects promotes=$passes)"
    fi
  fi
fi

# ---------- V5 promotion provenance (D6, C4) ----------
if need "$STATE" V5 && need "$PREREG" V5; then
  minp=$(jq -r '.minPairs' "$PREREG")
  bad=$(jq -r --argjson m "$minp" '
    [to_entries[] | select(.value.state=="promoted" and .value.provenance != "control") |
     select((.value.evidence.boundaryRef // "") == "" or (.value.evidence.pairs // 0) < $m)] | length' "$STATE")
  np=$(jq -r '[to_entries[] | select(.value.state=="promoted" and .value.provenance != "control")] | length' "$STATE")
  if [ "$np" -eq 0 ]; then verdict V5 RED "zero non-control promotions: objective C4 unmet (or accept-set empty: report it)"
  elif [ "$bad" -gt 0 ]; then verdict V5 RED "$bad/$np promotions lack a boundary artifact with pairs>=$minp (usage-gating regression)"
  else
    byprov=$(jq -r '[to_entries[] | select(.value.state=="promoted") | .value.provenance] | group_by(.) | map("\(.[0]):\(length)") | join(" ")' "$STATE")
    verdict V5 GREEN "$np promotions, all boundary-backed ($byprov)"
  fi
fi

# ---------- V6 credit ablation (D1, D8) ----------
if [ -x "$REPLAY_BIN" ] && [ -f "$STATE" ]; then
  if "$REPLAY_BIN" --ablate-promoted --state "$STATE" --episodes "$EPISODES" >/dev/null 2>&1; then
    verdict V6 GREEN "every promoted procedure is load-bearing (removal changes replayed answer)"
  else
    verdict V6 RED "a promoted procedure is decorative: ablation left the answer unchanged"
  fi
else
  verdict V6 BLOCK "replay executor or ladder state absent: ablation unprovable"
fi

# ---------- V7 generalisation (D10, D12, C5) ----------
if need "$STATE" V7:G1 && need "$EPISODES" V7:G1 && need "$PREREG" V7:G1; then
  floor=$(jq -r '.holdoutFloor' "$PREREG")
  g1=$(jq -r --slurpfile eps <(jq -s . "$EPISODES") --argjson f "$floor" '
    [to_entries[] | select(.value.state=="promoted" and .value.provenance != "control") |
     .key as $id | .value.promotedAt as $t |
     ([$eps[0][] | select(.arm=="exposed" and (.lineage // [] | index($id)) and .ts > $t)] ) as $post |
     select(($post | length) < 5
            or (([$post[] | select(.pairWin == true)] | length) / ($post | length)) < $f)] | length' "$STATE" 2>/dev/null || echo ERR)
  # <5 post-promotion episodes is a violation, not a skip: promoted with no holdout evidence = unproven
  [ "$g1" = "0" ] && verdict V7:G1 GREEN "all promoted procedures hold win-floor on post-promotion traffic (>=5 episodes each)" \
                  || verdict V7:G1 RED "temporal holdout fails or under-evidenced (violations=$g1)"
fi
if [ -d "$RUN_DIR-tenant2" ]; then
  c1=$(head -1 "$EPISODES" 2>/dev/null | jq -r '.commit // empty')
  c2=$(head -1 "$RUN_DIR-tenant2/episodes.jsonl" 2>/dev/null | jq -r '.commit // empty')
  if [ -n "$c1" ] && [ -n "$c2" ] && [ -z "$(git diff --stat "$c1" "$c2" -- src/ 2>/dev/null)" ]; then
    term=$(jq -r '.terminalState // empty' "$RUN_DIR-tenant2/summary.json" 2>/dev/null)
    case "$term" in
      promotions-with-wins|clean-floor) verdict V7:G2 GREEN "second corpus ran with zero src/ diff, terminal=$term";;
      *) verdict V7:G2 RED "second corpus has no decisive terminal state";;
    esac
  else verdict V7:G2 RED "second-corpus run not comparable (src/ diff nonzero or commits unresolvable)"; fi
else
  verdict V7:G2 RED "no second-corpus run: generalisation unproven"
fi
if compgen -G "lib/seeds/*" >/dev/null 2>&1 || compgen -G "runs/ladder/authored/*" >/dev/null 2>&1; then
  hits=$(grep -rlE 'templateId|pack\.jsonl|solvers/|from ["'"'"'].*eval/' lib/seeds runs/ladder/authored 2>/dev/null | wc -l | tr -d ' ')
  [ "$hits" = "0" ] && verdict V7:G3 GREEN "no seed or authored procedure references gold artifacts" \
                    || verdict V7:G3 RED "$hits sources reference gold artifacts (M1-class circularity)"
else
  verdict V7:G3 RED "no seeds or authored procedures exist to check"
fi

# ---------- V8 graceful floor (C6) ----------
if [ -f "$RUN_DIR/floor-probe.json" ]; then
  ok=$(jq -r '(.maskedServeOk == true) and (.driftAbstained == true)' "$RUN_DIR/floor-probe.json")
  [ "$ok" = "true" ] && verdict V8 GREEN "fully-masked product serves typed answers and abstains under drift" \
                     || verdict V8 RED "floor probe failed: product does not degrade gracefully"
else
  verdict V8 RED "floor probe never run"
fi

echo "----"
if [ "$FAIL" -eq 0 ]; then echo "VERDICT: GREEN (all checks)"; exit 0
else echo "VERDICT: RED"; exit 1; fi
