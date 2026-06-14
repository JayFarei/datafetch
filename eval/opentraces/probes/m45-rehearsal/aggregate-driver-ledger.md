# M4.5 Aggregate Driver Ledger

This note accounts for accepted rehearsal driver attempts plus archived false-start attempts caused by runner hardening bugs. The false-start directories are excluded from `normalized.jsonl` and scoring, but their driver tokens count against the rehearsal cap for transparency.

| bucket | path | attempts | tokens | turns | status |
| --- | --- | ---: | ---: | ---: | --- |
| accepted rehearsal | `eval/opentraces/probes/m45-rehearsal/token-ledger.json` | 12 | 1712949 | 85 | normalized and scored |
| false start 1 | `eval/opentraces/probes/m45-rehearsal-false-start-20260613T0734Z/token-ledger.json` | 6 | 968057 | 46 | archived, false incomplete classification |
| false start 2 | `eval/opentraces/probes/m45-rehearsal-false-start-20260613T0743Z/token-ledger.json` | 1 | 143343 | 7 | archived, false incomplete classification |
| total actual M4.5 driver spend |  | 19 | 2824349 | 138 | under 3000000 cap |

Cap result: `2,824,349 / 3,000,000` full-weight model-context driver tokens. Cap was not hit.
