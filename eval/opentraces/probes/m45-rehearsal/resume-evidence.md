# M4.5 Resume Evidence

Label: REHEARSAL. These rows are excluded from M5 analysis.

## Deliberate Stop And Resume

- First completed episode: `otc-0001 seed-1 armN`, completed at `2026-06-13T07:51:41.665Z`.
- Resume at `2026-06-13T07:53:48.634Z` logged `skip-completed` for `otc-0001 seed-1 armN` with the same completed timestamp.
- Later resume at `2026-06-13T08:03:03Z` skipped four completed episodes without rerunning them.
- Deliberate stop evidence: `runner-log.jsonl` has `deliberate-self-sigterm` at `2026-06-13T08:03:47.288Z`, followed by `signal: SIGTERM` with `deliberate: true`.
- Final resume at `2026-06-13T08:04:53.027Z` used default parallelism 4 and finished `12/12` episodes at `2026-06-13T08:07:00.388Z`.

## Completed Episode Timestamps

| ordinal | row | seed | arm | completed_at | tokens | turns | correct_vs_gold |
| ---: | --- | --- | --- | --- | ---: | ---: | --- |
| 0 | otc-0001 | seed-1 | armN | 2026-06-13T07:51:41.665Z | 114910 | 6 | false |
| 1 | otc-0001 | seed-1 | armR | 2026-06-13T07:56:01.042Z | 203067 | 9 | true |
| 2 | otc-0001 | seed-1 | armL | 2026-06-13T07:59:07.392Z | 90467 | 5 | true |
| 3 | otc-0001 | seed-2 | armR | 2026-06-13T08:00:33.546Z | 152011 | 7 | false |
| 4 | otc-0001 | seed-2 | armL | 2026-06-13T08:03:47.160Z | 161191 | 8 | true |
| 5 | otc-0001 | seed-2 | armN | 2026-06-13T08:06:23.667Z | 142299 | 7 | null |
| 6 | otc-0153 | seed-1 | armR | 2026-06-13T08:06:01.438Z | 163507 | 8 | null |
| 7 | otc-0153 | seed-1 | armL | 2026-06-13T08:05:54.735Z | 113635 | 6 | true |
| 8 | otc-0153 | seed-1 | armN | 2026-06-13T08:06:17.981Z | 184243 | 9 | null |
| 9 | otc-0153 | seed-2 | armL | 2026-06-13T08:06:28.623Z | 113934 | 6 | true |
| 10 | otc-0153 | seed-2 | armN | 2026-06-13T08:06:39.347Z | 136451 | 7 | null |
| 11 | otc-0153 | seed-2 | armR | 2026-06-13T08:07:00.190Z | 137234 | 7 | null |

## Ledger

Rehearsal spend: `1,712,949 / 3,000,000` full-weight model-context driver tokens. Cap was not hit.
