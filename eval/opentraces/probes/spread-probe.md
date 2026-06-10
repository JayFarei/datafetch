# G0 spread probe (plan 011 R9, KILL-GATE)

Question: is inline derivation over this store expensive enough that a learned interface has something to amortise? PokeAPI failed exactly here (spread ~0, M\* = +Infinity); measure the spread BEFORE building anything else.

## Pre-registered thresholds (fixed before any measurement; do not edit after the first measurement row lands)

- PASS requires BOTH: median(naive / expert) >= 5x on model-context tokens, AND median(naive - expert) >= 10,000 model-context tokens, over the 10 questions.
- FAIL on either condition -> the corpus is declared null-risk, the plan STOPS, and the negative finding is written to the RUN-LOG and kb/research.md. A STOP is a successful outcome.
- Secondary (recorded, not gating): naive turns vs expert turns; wall-clock.

## Pinned measurement protocol

- **Driver model is pinned to `claude-sonnet-4-6`** (the house eval model). The build agent must NOT use its own session/model to measure the naive arm; a weaker driver inflates naive cost and biases G0 toward PASS. Launch each measurement as a fresh `claude -p` session (`--model claude-sonnet-4-6`), one question per session, no carryover.
- **Naive arm**: the session gets the question text, the snapshot root path, and tool access to bash + jq + python3 only. No datafetch, no solvers/, no SCHEMA-TRUTH, no schema hints. It must end with a stated final answer.
- **Expert arm**: an identical fresh session is given the question text plus the exact one-line solver invocation (`python3 eval/opentraces/solvers/<id>.py <params>`) and asked to run it and state the answer. This prices "the interface already exists".
- **Token accounting** (house headline unit, full weight): model-context tokens = input + cache_read + cache_creation + output summed over the session, read from the session's usage telemetry (`claude -p --output-format json`). Turns = assistant message count. Record per question: tokens, turns, correct? (vs the reference solver gold), and the transcript path.
- A naive run that ends WRONG counts its full cost AND is flagged; if more than 3/10 naive runs are wrong, record that as an independent finding (the store is not just expensive but error-inducing), still apply the thresholds over all 10.

## The 10 questions (v0 draft, supervisor-authored)

Drawn from the persona templates (one or two per persona, cross-store joins included). Slots Q1-Q10 are REPLACEABLE by the user's real questions at redline; mark any substitution in the table below before running. Parameter values chosen to be answerable from the frozen snapshot; reference gold comes from the matching solver (M4 hand-built for these ten first).

| # | Persona/template | Question (consumer phrasing, given verbatim to the driver) |
|---|---|---|
| Q1 | P1-T1 | Across all captured sessions in May 2026, how many total input tokens and output tokens were spent, broken down by model? |
| Q2 | P1-T3 | Which 5 sessions in May 2026 have the highest average fresh-input tokens per step? List their ids and the value. |
| Q3 | P1-T4 | On the single most expensive day in May 2026 (by total input+output tokens), which sessions accounted for at least 10% of that day's total each? |
| Q4 | P2-T2 | For the skill named in the snapshot's skill invocations that was invoked most often during May 2026: how many sessions invoked it, what fraction of those sessions ended committed, and what was their mean duration in seconds? |
| Q5 | P3-T5 | Produce the third-party usage report for the project with the most sessions, May 2026: session count, first and last session date, total input+output tokens, and the fraction of sessions marked shareable. |
| Q6 | P3-T1 | How many sessions in the whole capture are shareable vs not, and what privacy tiers do the two groups carry? |
| Q7 | P4-T1 | Which captured session produced git commit 4f8a8300f6e391e317aebf47bfd0d458604e8a15? |
| Q8 | P4-T2 | How many sessions touched a file whose path contains "observer" during May 2026, and what did those sessions cost in total input+output tokens? |
| Q9 | P4-T4 | In the week of 2026-05-17, how many patches were created and how many of them ended up anchored to a git commit? |
| Q10 | P1-T7 | How many tokens did we spend on Gemini models in May 2026? (abstention cell: expected answer is "none / no such usage in the data") |

## Results (append-only; thresholds above were committed before any row below)

| # | naive tokens | naive turns | naive correct? | expert tokens | expert turns | spread | ratio |
|---|---|---|---|---|---|---|---|
| Q1 | 817,940 | 25 | no | 15,555 | 2 | 802,385 | 52.58x |
| Q2 | 1,429,681 | 51 | no | 15,885 | 2 | 1,413,796 | 90.00x |
| Q3 | 729,183 | 29 | no | 15,341 | 2 | 713,842 | 47.53x |
| Q4 | 3,075,948 | 52 | no | 16,084 | 2 | 3,059,864 | 191.24x |
| Q5 | 1,078,561 | 41 | no | 15,492 | 2 | 1,063,069 | 69.62x |
| Q6 | 277,779 | 17 | yes | 15,298 | 2 | 262,481 | 18.16x |
| Q7 | 269,709 | 14 | no | 15,828 | 2 | 253,881 | 17.04x |
| Q8 | 904,378 | 42 | no | 16,301 | 2 | 888,077 | 55.48x |
| Q9 | 260,967 | 22 | no | 15,845 | 2 | 245,122 | 16.47x |
| Q10 | 454,146 | 21 | yes | 15,364 | 2 | 438,782 | 29.56x |

## Measurement artifacts

- Driver: `claude -p --model claude-sonnet-4-6 --output-format json`.
- Isolation: actual G0 runs used `--safe-mode --no-session-persistence --tools Bash --allowedTools 'Bash(python3 *)' 'Bash(jq *)' --permission-mode bypassPermissions`. A pre-measurement dry run without `--safe-mode` was discarded because a local SessionEnd hook touched live OpenTraces config; the measured sessions disabled hooks before any rows above were collected.
- Token unit: full-weight model-context tokens from `modelUsage`, `inputTokens + cacheReadInputTokens + cacheCreationInputTokens + outputTokens`.
- Saved prompts and result JSON: `eval/opentraces/probes/g0-runs/`.
- Scored summary: `eval/opentraces/probes/g0-runs/scored-summary.json`.
- R7 cross-check summary: `eval/opentraces/probes/g0-runs/r7-cross-check.json`.
- Q7 SHA provenance: selected before running from a frozen `git_anchor_created` payload; the driver question omitted this provenance note.
- Median ratio: 50.06x. Median absolute spread: 758,113.5 model-context tokens. Naive wrong answers: 8/10. Total measured driver tokens: naive 9,298,292, expert 156,993.

Verdict: **PASS** (supervisor, 2026-06-10). Both pre-registered conditions clear by an order of magnitude: median ratio 50.06x vs 5x required; median spread 758,113.5 tokens vs 10,000 required. Every individual question clears both thresholds (min ratio 16.47x, min spread 245,122). Independent finding per protocol (>3/10 trigger): 8/10 naive runs ended WRONG, the store is error-inducing for cold search, not just expensive, which opens a correctness endpoint for the successor arms plan. Supervisor audit notes: (1) expert-arm costs carry a ~15.3k fixed session floor, so the ratio UNDERSTATES the interface advantage; (2) Q7's gold (session `cd7db306...`) disagrees with the naive answer (session `a300bf0a...`) and Q7 was not R7-cross-checked; "which session produced commit C" has trail-attribution semantics that `trail blame` implements authoritatively, so Q7's naive-wrong verdict is PROVISIONAL until the solver is cross-checked against `trail blame` in M4 (does not affect the cost verdict; 7/10 or 8/10 both exceed the trigger); (3) part of the naive error rate stems from semantic underspecification (window boundaries, "committed", "produced"), legitimate for a cost gate, but M4/M5 question text must pin these conventions so the future correctness endpoint is clean.
