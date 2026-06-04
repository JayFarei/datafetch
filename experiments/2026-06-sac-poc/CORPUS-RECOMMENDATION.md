# Corpus Derivation Recommendation — C4, C2, C5

**Program:** SaC PoC (`experiments/2026-06-sac-poc/`). **Method anchors:** kb/br/16 (benchmark selection), kb/br/17 (df.tool.* shape blockers), kb/br/19 (tri-state grader + 5-arm ladder + paired McNemar). **Synthesised from:** scout phase (4 agents) + verify phase (2 claims), with every load-bearing fact re-confirmed LIVE this session (curl HTTP codes, in-env file recompute, HF license API, WebSearch). Date: 2026-06-04.

## Decision table (one screen)

| Claim | Recommended corpus | In-env? | Tri-state / row-native / serial-depth fit | Confidence |
|---|---|---|---|---|
| **C4** governance-under-staleness | **CRAG Task-1+2 dev_v4, 2,706-Q** (`crag-harness` worktree, on-disk) | **YES, full + real** (5.16 GB jsonl, 2706 lines, not LFS) | **Tri-state: NATIVE** (+1/0/-1 grader already built). Drift: NATIVE (1,203 non-static rows) + inject-able. Row-native: N/A. | **HIGH** |
| **C2** zero-src onboarding | **`yilunzhao/robut`, config=main, split=wtq, perturbation_type=='original'** (HF Viewer) | **NO** (live HF mount; not on-disk) | **Row-native: NATIVE** (`table:{header,rows}` → df.db; `answers:[…]` → answerEquals). Tri-state: N/A. Serial: N/A. | **HIGH** |
| **C5** (bonus) deep-invocable, TURNS | **`dgslibisey/MuSiQue`, config=default, split=train, 3hop+4hop** (HF Viewer) | **NO** (live HF mount; not on-disk) | **Serial-depth: NATIVE & machine-encoded** (`question_decomposition` #1→#2→#3 DAG). Row-native: NO (evidence in `paragraphs[]` text). Tri-state: N/A. | **MEDIUM** |

USER-GATED, not derivable here: (a) whether the program accepts a fresh corpus for C5 vs staying on the structurally weak SkillCraft pokedex (cost/honesty trade-off the strategy left open); (b) whether CC-BY-NC (CRAG) is acceptable for the eventual product narrative, not just the research existence proof. Everything else below is now derivable.

---

## C4 — governance-under-staleness

**Recommended: CRAG (Meta KDD Cup 2024) public Task-1+2 dev_v4, 2,706-Q text set.**
**Runner-up: tau-bench / "tau-3-bench"** (companion only, for pass^k k=8 reliability framing — NOT a C4 carrier; it ships no +1/0/-1 grader and its "drift" is task-state not fact-staleness). FRAMES and CRAG-finance-slice are both dominated/disqualified (below).

**Decisive evidence (LIVE-VERIFIED this session unless flagged):**
- **Tri-state grader real + faithful** (the one thing binary scoring structurally cannot show). `eval/crag/scripts/score-crag.ts` (code-harness-evals worktree) computes `truthfulnessPct = accuracyPct − hallucinationPct`; abstention is never scored accurate, a wrong substantive answer is always −1, false-premise handled. This is the exact metric under which governed-ABSTAIN beats ungoverned-confidently-wrong. (Verify phase read the source in full; I did not re-read it this session — flagged as verify-phase-attested, not re-confirmed by me.)
- **Data in-env, real, full.** I re-confirmed live: `/Users/jayfarei/src/tries/2026-05-01-hackathon/.claude/worktrees/crag-harness/eval/crag/vendor/raw/crag_task_1_and_2_dev_v4.jsonl` = 5,164,388,176 bytes, `wc -l` = 2706, every row `json.loads`-parses. NOT an LFS pointer.
- **Distributions recomputed by me from the actual file (LIVE):** static_or_dynamic = static 1503 / slow-changing 583 / fast-changing 353 / real-time 267 → **1,203 drifting rows**; **false_premise = 309** (the canonical −1 "decline must win" cells); domains finance 661 / movie 611 / open 542 / sports 519 / music 373. Matches scout exactly.
- **Frontier r>0 on the CRAG metric** (verify phase, WebFetch arxiv 2510.26160 CRAG-MM Oct 2025, post-cutoff): GPT-5 single-turn truthfulness 32.2%, Claude-Sonnet-class single-turn −2.8%, even GPT-5 reaches only 63% accuracy at 31% hallucination, "ample room for improvement." This is GPT-5/Sonnet-class on the Accuracy-minus-Hallucination metric, nowhere near ceiling. PROJECTION CAVEAT: CRAG-MM is multimodal, NOT the identical text corpus — it confirms the metric/family is unsaturated, not the exact 2,706-Q text slice.
- **In-env paired report (LIVE-attested by verify phase):** sonnet-4-6 cold arm 37.5% acc / 43.75% halluc on a 16-Q finance slice, squarely in the published 33-44% band.

**Acquisition plan — typed: DOABLE now (data + grader), DOABLE-with-effort (signal-firing harness).**
- Data + tri-state grader + finance SQLite KG already on disk in sibling worktrees → port into run tree or run from worktree. Near-zero.
- **One trivial unbuilt ETL (DOABLE, ~1 line):** the raw dev_v4 file has **0/2706 rows with an `answer_type` field** (I re-confirmed: `has_answer_type_field: False`), but `score-crag.ts` keys false-premise on `answer_type==='invalid'`. Derive `question_type==='false_premise' → answer_type='invalid'` before scoring, or the 309 governance cells silently mis-score. The HF mirror `Quivr/CRAG` exposes `answer_type` natively if you prefer.
- **The real open work (DOABLE, none IMPOSSIBLE):** (a) build the A0 `injectDrift` $0 kill-gate over the frozen gate + mutable finance SQLite — it can terminate C4 at DONE-HONEST-NEGATIVE for free; (b) a REPEATED-STRUCTURE sibling stream (one template × many entities) because the only in-env run gave df.lib reuse 0/16 on a heterogeneous slice — without reuse density the governance signal cannot engage; (c) br17 df.tool.* reuse-firing (dual-typed BLOCKED-ENVIRONMENTAL for df.db remap data + BLOCKED-DOABLE for the FANOUT(db) render-path).

**Expected r>0 hardness-screen outcome:** PASS — Arm-1 truthfulness materially below ceiling (frontier 32% truthfulness, 37.5% acc in-env). Honest qualifier: r>0 is **confirmed for the CRAG family/metric, projected for the exact 2,706-Q text headline slice**; the A0 screen must still measure Arm-1 on the chosen text slice.

**License:** CC BY-NC 4.0 (verified, facebookresearch/CRAG). Fine for research existence proof; NC blocks commercial product framing — carry as disclosed constraint (USER-GATED for product narrative).

**Exact next step against eval/skillcraft harness:** (1) write the `question_type==='false_premise' → answer_type='invalid'` ETL pass over `crag_task_1_and_2_dev_v4.jsonl`; (2) wrap the 2,706-Q jsonl in a MountAdapter exposing `query`/`answer`/`static_or_dynamic` as a df.db-style collection (finance SQLite KG as the drift fixture); (3) wire `score-crag.ts` as the verifier so gold flows through the +1/0/-1 path (CRAG's `answer` strings, false-premise's `'invalid question'`, drive the tri-state, NOT `answerEquals` binary); (4) build the A0 `injectDrift` $0 kill-gate FIRST — it is the C4 gate and is free.

---

## C2 — zero-src onboarding sufficiency

**Recommended: `yilunzhao/robut`, config=main, split=wtq, filtered client-side to `perturbation_type=='original'`.**
**Runner-up: `kasnerz/hitab`** (VIABLE backup — row-native QA, exact-match `answer`, but `table_content` is a stringified hierarchical top_root/left_root tree needing a flattening parser → medium ETL vs ROBUT's clean flat `{header,rows}`). BIRD-mirror, Spider, wikisql native, FRAMES all DISQUALIFIED (pairs-not-rows / 404 / 501 / schema-only).

**Decisive evidence (LIVE-VERIFIED by me this session):**
- **Row-native, NOT text-to-SQL — the decisive C2 check.** `curl …/rows?dataset=yilunzhao/robut&config=main&split=wtq&offset=0&length=1` → **HTTP 200**, row keys `[id, question, answers, table, perturbation_type, original_id]`. ROW0: question `"which team won previous to crettyard?"`, `answers:['Wolfe Tones']`, `table.header:['Team','County','Wins','Years won']`, `table.rows[0]:['Greystones','Wicklow','1','2011']`, `perturbation_type:'original'`. Executable table rows + exact-match list, NO SQL string.
- **Sizes (LIVE, /size HTTP 200):** wtq=38,246 / wikisql=74,989 / sqa=11,410.
- **License MIT (LIVE):** `cardData.license = mit`, no NC clause. Product-safe — the cleanest license of the three.
- **Saturation r>0 (PROJECTED, web-sourced):** WTQ SOTA ~75.8% (Orchestra+DeepSeek-V3), AutoTQA+GPT-4 75.3%, ReAcTable/GPT-4 68.0%, GPT-4o direct ~67.7% — all materially below the ~85% ceiling, and these are tool-augmented frameworks so plain Arm-1 inline sits lower.

**Acquisition plan — typed: DOABLE now (low ETL via HF Viewer mount).** Per row: materialise `row.table` (header→columns, rows→records) into a df.db collection; grade `row.answers` via `answerEquals`. No 33 GB GitHub release (unlike BIRD), no unpickling (unlike CRAG finance), no tree parsing (unlike HiTab). Use `src/adapter/huggingface/HuggingFaceMountAdapter.ts` (DEFAULT_ENDPOINT `https://datasets-server.huggingface.co`, paginates `/rows` in bounded windows).

**Expected r>0 hardness-screen outcome:** PASS projected — Arm-1 inline well below 85% (WTQ ~68-76% even tool-augmented). Honest flag: **no Claude/Sonnet-4.6 WTQ denotation number exists in the literature**; projected from the GPT-4/GPT-4o/DeepSeek cluster, not measured. The B0 $0 probe must establish the real Arm-1 pass-rate on the WTQ-original slice.

**Two build caveats (LIVE-verified):** (a) ROBUT is a perturbation-robustness SUPERSET — perturbed rows are interleaved (verify phase confirmed an offset-5000 row was `perturbation_type=='synonym'`); filter client-side to `'original'` to match published WTQ hardness. The Viewer `/filter` endpoint 500'd, so selection is post-`/rows`-fetch in code. (b) Transient Viewer instability seen (offset-5000 returned 504 then 200 on retry) → the adapter needs retry/backoff; consider snapshotting the wtq-original slice locally for a pinned deterministic run (mirror has downloads=23, likes=1 — low-traffic, could be withdrawn).

**Exact next step against eval/skillcraft harness:** (1) extend `HuggingFaceMountAdapter` to page `yilunzhao/robut` wtq with retry/backoff, filtering `perturbation_type=='original'` post-fetch; (2) per question, materialise `row.table` into a df.db collection (header→columns, rows→records) the agent reaches via `df.db`; (3) gold = `row.answers` graded through `answerEquals(got, expected, {relTol})` (existing `src/runtime/answerKit.ts` — numeric-coerce-then-string-fallback handles both `['6']` and `['Wolfe Tones']`); (4) run the B0 $0 hardness screen to pin the live Arm-1 inline pass-rate before any rung.

---

## C5 (bonus) — deep-invocable helper, TURNS

**Recommended: `dgslibisey/MuSiQue`, config=default, split=train, 3hop+4hop rows.**
**Runner-up: `google/frames-benchmark`** (VIABLE — genuine 2-6 hop serial chains, short exact `Answer`, Apache-2.0; but each hop's evidence is an EXTERNAL Wikipedia article, not bundled in-row → needs a Wikipedia ETL/mount or live-web tool, which introduces nondeterminism that fights the pinned-snapshot requirement). FinReflectKG-MultiHop (no harness, no baseline, NC, KG not row-shipped) and CRAG (fan-out shape + finance saturation) are not C5-appropriate.

**Decisive evidence (LIVE-VERIFIED by me this session):**
- **Serial-depth is machine-encoded — the decisive C5 check.** `curl …/rows?dataset=dgslibisey/MuSiQue&config=default&split=train&offset=15000&length=1` → **HTTP 200**. Row `3hop1__291586_715233_59314`, `question_decomposition` = a strictly-serial DAG: hop1 `"Teafuone >> part of" => Nukufetau`; hop2 `"#1 >> located in or next to body of water" => Pacific Ocean`; hop3 `"where does the columbia river meet #2" => Columbia Bar`. The `#1`/`#2` back-references prove each hop is UNPOSEABLE until the prior resolves — the exact regime where a one-shot chain-walking INVOCABLE helper saves TURNS vs one-turn-per-hop inline re-derivation. Contrast SkillCraft pokedex (fan-out-wide, 5 entities in one Promise.all turn).
- **Size (LIVE, /size HTTP 200):** train 19,938 / validation 2,417. Answers are short strings (`answer` + `answer_aliases`) → answerEquals-gradeable.
- **Saturation r>0 (PROJECTED, web/memory):** MuSiQue is purpose-built to resist shortcuts (question-only ~5 F1; human 78.0 vs machine 49.8 F1; 2025 SOTA structured-prompting low-to-mid 40s F1). Arm-1 inline would sit far below ceiling.

**Acquisition plan — typed: BLOCKED-DOABLE (moderate substrate work, no large fetch — rows are in the Viewer).** The shape/mount tension is the real cost: MuSiQue's serial chains live in `paragraphs[]` TEXT, not relational columns, so it is NOT the clean df.db row-native mount C2 wants. The natural C5 modeling is a per-hop retrieval/lookup TOOL over the bundled `paragraphs[]` (df.tool.* or df.db over a paragraphs collection keyed by title). Per br17 this re-triggers FANOUT(tool)-collapse + frozen-clone risk, and the deep-INVOCABLE-helper crystallisation gap (`src/observer/author.ts` hardwires shallow toolFanout) must be solved — same B-5-style preseed as the SkillCraft C5 path. Needs: (1) a paragraphs MountAdapter, (2) the deep serial-chain helper PRESEEDED (not crystallised), (3) answerEquals gold from `answer`+`answer_aliases`, (4) a TURNS-path scorer (not pass/fail).

**Expected r>0 hardness-screen outcome:** PASS projected by a wide margin (machine F1 ~50 vs human ~78). Honest flag: no pinned Sonnet-4.6 MuSiQue pass-rate measured; $0 hardness-screen probe still required.

**License — honest split:** the canonical MuSiQue (Trivedi et al., TACL 2022) is **CC-BY-4.0** (product-safe), per the publication. BUT the `dgslibisey/MuSiQue` HF mirror carries **NO license tag** — I verified twice that `cardData` is empty and tags contain no license. So the *underlying corpus* is CC-BY-4.0 but the *mirror you'd mount* is unlicensed-on-HF. UNVERIFIED ASSUMPTION flagged: that the mirror faithfully reproduces the canonical CC-BY-4.0 data. Mitigation: for a pinned run, source from the canonical StonyBrookNLP/musique release (CC-BY-4.0 attested) rather than relying on the unlicensed mirror.

**Exact next step against eval/skillcraft harness:** (1) build a MountAdapter that lands `paragraphs[]` as a per-row title-keyed lookup collection (df.tool or df.db); (2) PRESEED a deep serial-chain-walking INVOCABLE helper (do NOT rely on the observer crystallising it — `author.ts` hardwires shallow toolFanout, the known C5 substrate gap); (3) gold = `answer` + `answer_aliases` via `answerEquals`; (4) scorer must count agent TURNS (not just pass/fail) so the deep-invocable-saves-turns thesis is measurable; (5) run the $0 hardness screen on the 3hop+4hop slice.

---

## Honesty ledger — LIVE-VERIFIED vs PROJECTED vs USER-GATED

**LIVE-VERIFIED by me this session (Bash/curl/WebSearch):**
- CRAG: in-env file 5.16 GB / 2706 lines / parses; distributions (1,203 drift, 309 false_premise, domain split) recomputed from the actual file; `answer_type` field absent (0/2706).
- ROBUT: `/rows` HTTP 200 with row-native `table:{header,rows}` + `answers:[…]`; `/size` 38,246/74,989/11,410; license MIT; downloads 23 / likes 1.
- MuSiQue: `/rows` HTTP 200 at offset 15000 with the 3-hop `#1→#2` decomposition; `/size` 19,938/2,417; HF mirror cardData empty / no license tag (verified twice); canonical CC-BY-4.0 via WebSearch (TACL 2022).
- `answerEquals(got, expected, {relTol})` signature in `src/runtime/answerKit.ts`; `HuggingFaceMountAdapter` exists; 7 worktrees incl. crag-harness @ 573d529ab.

**PROJECTED (web/memory, NOT a pinned Sonnet-4.6 run):** every saturation/F1 number (CRAG 32-37%, WTQ 68-76%, MuSiQue ~50 F1); CRAG-MM is multimodal not the identical text corpus; the score-crag.ts internals are verify-phase-attested, not re-read by me this session.

**Unverified assumptions flagged:** (1) the `dgslibisey/MuSiQue` mirror faithfully reproduces canonical CC-BY-4.0 data despite carrying no HF license tag; (2) all three corpora's r>0 holds on Sonnet-4.6 specifically — every one needs its own $0 hardness screen before a live rung; (3) MuSiQue/ROBUT live Viewer availability at run time (low-traffic mirrors; snapshot recommended).

**Genuinely USER-GATED (not derivable here):** (a) C5 corpus choice — fresh MuSiQue (honest serial-depth, moderate substrate cost) vs SkillCraft pokedex (cheap, structurally weak, already specced); (b) CC-BY-NC acceptability for CRAG in any product narrative beyond the research existence proof.

Relevant paths: `/Users/jayfarei/src/tries/2026-05-01-hackathon/.claude/worktrees/crag-harness/eval/crag/vendor/raw/crag_task_1_and_2_dev_v4.jsonl`; `/Users/jayfarei/src/tries/2026-05-01-hackathon/.claude/worktrees/code-harness-evals/eval/crag/scripts/score-crag.ts`; `/Users/jayfarei/src/tries/2026-05-01-hackathon/src/adapter/huggingface/HuggingFaceMountAdapter.ts`; `/Users/jayfarei/src/tries/2026-05-01-hackathon/src/runtime/answerKit.ts`; `/Users/jayfarei/src/tries/2026-05-01-hackathon/eval/skillcraft/`.
