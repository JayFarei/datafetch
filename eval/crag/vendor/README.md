# CRAG vendored dataset

Raw files are NOT committed (705 MB compressed, 4.8 GB uncompressed).
Re-download via `bash eval/crag/scripts/prepare-crag.sh`.

## What's here (after preparation)

```
raw/
  crag_task_1_and_2_dev_v4.jsonl     # 4.8 GB uncompressed
  crag_task_1_and_2_dev_v4.jsonl.bz2 # 705 MB
```

`task_1_and_2_dev` is the **public dev split** (validation + public test) =
**2,706 records** total. CRAG's official train/test split:

- `split == 0` (validation): **1,371 records**
- `split == 1` (public test): **1,335 records**

The private test set (`split == 2`, ~1,703 records) is held by Meta for the
KDD Cup 2024 leaderboard and is not downloadable.

## Distribution (verified 2026-05-18 against this file)

### Per domain

| domain   | count |
|---|---|
| finance  |   661 |
| movie    |   611 |
| open     |   542 |
| sports   |   519 |
| music    |   373 |
| **total**| **2,706** |

### Per question type

| question_type      | count |
|---|---|
| simple             |   754 |
| simple_w_condition |   407 |
| comparison         |   333 |
| aggregation        |   315 |
| false_premise      |   309 |
| set                |   249 |
| multi-hop          |   231 |
| post-processing    |   108 |
| **total**          | **2,706** |

### Per dynamism

| static_or_dynamic | count |
|---|---|
| static            | 1,503 |
| slow-changing     |   583 |
| fast-changing     |   353 |
| real-time         |   267 |
| **total**         | **2,706** |

### Popularity

**NOT IN THIS DATASET.** The `popularity` field (head/torso/tail) is
documented in the CRAG paper but the value is empty (`""`) for all 2,706
records in `crag_task_1_and_2_dev_v4.jsonl`. Likely available only in the
task 3 split (web + mock KG combined) or in CRAG's internal scoring rubric.
**Update to `eval/crag/rubric.md`:** drop the head/torso/tail slicing; keep
domain × question_type × dynamism slicing only.

## Schema (per record)

```json
{
  "interaction_id": "uuid",
  "query_time": "MM/DD/YYYY, HH:MM:SS PT",
  "domain": "finance" | "movie" | "music" | "sports" | "open",
  "question_type": "simple" | "simple_w_condition" | "comparison" | "aggregation" | "false_premise" | "set" | "multi-hop" | "post-processing",
  "static_or_dynamic": "static" | "slow-changing" | "fast-changing" | "real-time",
  "query": "natural-language question",
  "answer": "gold answer string",
  "alt_ans": ["array of alternative valid answer strings"],
  "search_results": [
    {
      "page_name": "...",
      "page_url": "...",
      "page_snippet": "...",
      "page_result": "<full HTML>",
      "page_last_modified": "..."
    }
  ],
  "split": 0 | 1
}
```

`task_1_and_2_dev_v4` ships **5 search_results per record** (task 1 has 5
pages; task 2 has 5 pages + mock-KG-API access). Task 3 ships 50 pages per
record but is downloaded separately (`crag_task_3_dev_v4.tar.bz2.part1-4`,
needs `cat` + `tar` + `bunzip2`).

## Mock KG / mock API

The 2.6M-entity mock KG and the Python mock-API Flask server live in CRAG's
`mock_api/` directory. **Not vendored here.** The substrate adapter
(`src/eval/cragFullDatafetch.ts`) needs to either:

- (A) Spin up CRAG's Python Flask sidecar and proxy from TS via fetch.
- (B) Reimplement the 33 mock-API functions in TS against in-process JSON.
- (C) Load the mock KG into the substrate's `MountAdapter` and expose via
  `df.db.crag*` primitives (the cleanest substrate fit, more work).

Decision is iter4's. Iter1 + iter2 probed (A)-equivalent and (C)-equivalent
shapes; neither alone produces useful crystallisation per `EXPERIMENTS.md`.

## Provenance

Downloaded from:
`https://github.com/facebookresearch/CRAG/raw/refs/heads/main/data/crag_task_1_and_2_dev_v4.jsonl.bz2`

License: CC BY-NC (Meta).

CRAG paper: arXiv:2406.04744, June 2024.
