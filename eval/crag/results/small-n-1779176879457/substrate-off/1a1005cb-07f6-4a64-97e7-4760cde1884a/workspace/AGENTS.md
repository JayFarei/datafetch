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

> in what language was dead meat released?

(Domain: movie; question_type: simple;
static_or_dynamic: slow-changing)

## How to write your answer

Write **scripts/answer.ts** with the SHAPE. **Make multiple targeted
searches**, one per distinct entity or key concept in the question. The
substrate learns from repeated patterns; multiple focused searches give
better retrieval than one broad search AND let the substrate amortise
your search work across sibling questions.

```ts
// Decompose the question into 2-4 specific search queries (entities,
// dates, key terms). Run them as separate calls — DO NOT collapse to
// one big search.
const hits = await Promise.all([
  df.db.cragWeb.search("specific entity or term 1", { limit: 3 }),
  df.db.cragWeb.search("specific entity or term 2", { limit: 3 }),
  // df.db.cragWeb.search("specific entity or term 3", { limit: 3 }),
]);

// Inspect pageSnippet and pageResult across all hits to extract the
// answer. Cross-reference if the question requires it.
const pages = hits.flat();

return df.answer({
  status: "answered",
  value: "the short answer string",
  evidence: pages.slice(0, 3).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "1-sentence note on how you derived the answer",
});
```

The `return` is REQUIRED — the answer envelope must be the resolved
value of the snippet's top-level async IIFE. **Multiple search calls is
required, not optional** — even if one search would suffice, decompose
the question into 2-4 calls so the substrate can crystallise the
retrieval pattern.

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
