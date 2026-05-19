# CRAG Question Workspace

You are answering one factual question from the CRAG benchmark. Your job is
to write `scripts/answer.ts` that:

1. Searches the cached web pages (`df.db.cragWeb.search`) to find
   supporting evidence for the question below.
2. Extracts the answer from the page text (HTML inline in
   `pageResult`).
3. Returns `df.answer({...})` with:
   - `status: "answered"` when you find a supported answer
   - `status: "unsupported"` when the question is unanswerable or the
     premise is false ("I don't know" / "invalid question")
   - `value`: a short string answer
   - `evidence`: array of `{pageUrl, pageName}` you used

## The question

> what's the total number of floors in burj khalifa, including all floors above and below ground, can you tell me that?

(Domain: open; question_type: aggregation;
static_or_dynamic: static)

## How to write your answer

Write **scripts/answer.ts** with the SHAPE:

```ts
const pages = await df.db.cragWeb.search("relevant search terms", { limit: 5 });
// inspect pages[i].pageSnippet and pages[i].pageResult to extract the answer

return df.answer({
  status: "answered",
  value: "the short answer string",
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "1-sentence note on how you derived the answer",
});
```

The `return` is REQUIRED — the answer envelope must be the resolved
value of the snippet's top-level async IIFE.

## Calibration rules

- If the question's premise is false (e.g. asks for an event that never
  happened), return `status: "unsupported"` and `value: "invalid question"`
  rather than fabricating an answer. CRAG's grader penalises hallucination
  more than abstention.
- Short answers beat long answers. Aim for the minimal substring that
  matches the gold (a number + unit, a name, a date).

## What you have

- `df.db.cragWeb.search(query, {limit})` — BM25-lite over the 5
  pre-retrieved pages for this question.
- `pnpm datafetch:run scripts/probe.ts` — sandboxed eval of a snippet
  against the substrate (results in tmp/runs/...). Use this to test
  extraction logic before committing the final answer.

## What to do

1. Read this AGENTS.md and the inline question.
2. Write `scripts/answer.ts` with your final answer.
3. Stop. The harness will run the script after you exit.
