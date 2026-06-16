# Cost-pillar ceiling probe (2026-06-03, $0 model spend)

**Question (Thesis 3 from the regeneration workflow):** can a *hand-optimal* DEEP +
INVOCABLE helper drop the arm4 phase-2 `answer.ts` below the arm1 inline baseline
(80 lines / ~2,910 fresh+output tokens) at correct output? If even a hand-optimal
helper cannot, the cost pillar is refuted for this family before any live run.

## Method
Hand-authored `lib_pokedexEntries.ts` — a deep helper that walks the whole per-pokemon
DAG (details+species → evolution via chain_id; moves; abilities) and returns FINISHED
entries with every evaluator-required field, behind a fully-typed PUBLIC signature
`{ ids }` (no intent-only stub). Field extraction is byte-identical to the arm1 inline
baseline that passed, so output correctness is by-construction. Then `answer_deep.ts` —
the minimal call+aggregate+emit the agent would write.

## Result — GATE CLEARS
| artifact | code lines | code chars | ~code tokens |
|---|---|---|---|
| arm1 inline baseline (`.../arm1/seed-4/.../answer.ts`) | 72 | 2,539 | ~635 |
| deep-helper `answer_deep.ts` | **20** | **730** | **~183** |

20 < 80 lines ✅ and ~183 ≪ ~635 code tokens (arm1 measured fresh+output incl. reasoning
= 2,911). A deep+invocable helper collapses the caller's write-cost ~3.5×. **The cost
pillar is NOT refuted — it died for SHALLOW helpers; a deep+invocable one is viable in
principle.** (Contrast the LIVE shallow `toolFanout`: arm4 answer.ts was 124 lines, LONGER
than arm1, because the helper was shallow + non-invocable.)

## Honest caveats (what the probe does and does NOT prove)
1. **Build cost is real:** the deep helper is ~51 code lines that must be produced ONCE
   (amortised over M reuses). The observer today crystallises SHALLOW (`toolFanout`), not
   deep — so realizing this needs a substrate change (deeper crystallisation + an
   auto-populated/typed invocable signature) OR a preseed. That is the actual work.
2. **The live driver is TURNS, not answer.ts size.** Our valid run showed the +66k was a
   turn-count tax (arm4 +1.8 turns × ~36k cached/turn). The probe shows the OUTPUT can
   drop ~3.5×, which *strongly suggests* fewer turns (one-shot call vs inline exploration),
   but only a live k≥5 run measuring **arm4 mean turns vs arm1's 4.6** confirms it.
3. **Correctness is by-construction** (identical field logic to the passing arm1 version);
   full validation is the live run.

## Verdict / routing
Cost island = REOPENED but conditional + not cheap: it needs (i) deep+invocable
crystallisation (substrate work, not a runner tweak) then (ii) a live k≥5 run measuring
TURNS + correctness NI. Promise: medium; provably bounded out of LLM-cored ("expensive
inline" = `df.llm.*`) regimes until that shim ships. Compare against the SDK zero-src
onboarding island (highest promise, cheapest, structurally sound) before spending the
substrate+live effort.
