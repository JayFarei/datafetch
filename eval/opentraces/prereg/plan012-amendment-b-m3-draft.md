# Plan 012 Amendment B M3 Pre-Registration Draft

Status: DRAFT for supervisor review. This draft is not a commit and does not authorize M5.

## Scope

This pre-registration governs the Amendment B curated-interface full run only. The organic-emergence arms remain terminally failed. Rehearsal episodes, smoke runs, runner tests, and M-B2/M-B2b pilot episodes never enter the M5 analysis set.

## Arms

- armN: mounted workspace, db primitives only, no library and no recipe.
- armR: armN plus one template-blind natural-language recipe, <=600 characters.
- armL: armN plus the curated callable interface exposed in `df.d.ts`.

The three driver prompts must be byte-identical except for the single binding block. The `armL` `df.d.ts` may expose the library section; after removing that section, all three declarations must hash identically.

## Claim Sentences

PRIMARY: armL truthfulness exceeds armN, measured as per-question majority correctness over k=3 seeds. The primary claim is upheld only when the clustered confidence interval for armL minus armN excludes 0 in the positive direction.

CO-PRIMARY: armL uses fewer full-weight model-context tokens and fewer turns than armN while preserving non-inferior correctness. Non-inferior correctness is defined as armL minus armN majority-correctness rate >= -5 percentage points.

ATTRIBUTION: armL must also beat armR on the primary truthfulness endpoint. If armL does not beat armR, the callable-interface claim is not made, even if armL beats armN.

SLICES: report the same correctness, token, and turn endpoints for abstention rows, each persona, and each difficulty. Slices are diagnostic unless explicitly promoted by a later supervisor addendum before M5.

## Sample

Full run size: 104 questions x 3 arms x k=3 seeds = 936 driver episodes.

Question sample: deterministic four-sibling subsample from each of the 26 templates in `eval/opentraces/questions/pack.jsonl`, selected by ascending SHA-256 hash of:

`plan012-amendment-b-m3-subsample-v1 + "\0" + template_id + "\0" + row_id`

The four lowest-hash siblings per template are selected, then ordered by template id and row id. The selected row ids are recorded in `plan012-amendment-b-m3-subsample-v1.json`.

Seeds: `1`, `2`, `3`. Seeds are logical replicate labels; they do not alter the driver-facing prompt text.

Arm interleaving order: for question index `q` and seed index `s`, rotate base order `[armN, armR, armL]` left by `(q + s) % 3`. This prevents one arm from always occupying the same wall-clock position while keeping the schedule deterministic.

## Budget And Stops

Hard cap: 161,000,000 full-weight driver model-context tokens. The runner must stop scheduling new episodes when the accumulated driver-attempt ledger reaches the cap.

Parallelism: default 4, configurable by flag. If rate-limit or transport failures recur, lower parallelism rather than grading failed episodes.

M5 is not authorized by this draft. Supervisor reviews M3/M4/M4.5 and makes the pre-registration commit before any M5 driver episode runs.

## Incomplete Episodes

Any episode ending in an API, rate-limit, overload, timeout, or transport error is INCOMPLETE. Incomplete episodes are never normalized and never graded. Resume retries incomplete episodes after backoff. The scorer must assert zero incomplete episodes in any analysis set.

## Analysis

The normalized row is the only scorer input. It contains row id, template id, persona, difficulty, answer type, arm, seed, full-weight tokens, turns, driver command, grade-v2 result, answer status, and episode directory.

Truthfulness is computed from grader-v2 correctness. Missing answer values count as not correct for rates. For k=3, a question-arm is majority-correct when at least two seeds are correct.

Clustered confidence intervals are computed by deterministic bootstrap over template clusters. The scorer reports the paired armL-armN and armL-armR majority-correctness differences and intervals.

The co-primary cost endpoint uses full-weight model-context tokens:

`input_tokens + cache_read_input_tokens + cache_creation_input_tokens + output_tokens`

Turns use the driver JSON `num_turns` value.

## Exclusions

No edits to `src/**` or existing `eval/harness/**` are part of this pre-registration. The sealed pack, solvers, personas, conventions, and probe docs remain immutable. `SCHEMA-TRUTH.md` and `vendor/schema-facts.json` must not reach any driver prompt or mounted workspace. All driver data reads come from the sealed snapshot through the mount layer.
