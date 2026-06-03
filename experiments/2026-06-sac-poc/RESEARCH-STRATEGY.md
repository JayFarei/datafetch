# Research Strategy: Proving (or Honestly Falsifying) the Datafetch Thesis

## TL;DR (one screen)

The cheap-fan-out cost-amortisation lever is **dead** (valid k=5 pokeapi-h1x run: M\* = +∞, arm4 cost > arm1 in every token unit — full-weight −66,521, fresh+output −97, dollar-equiv −6,740 — and arm4 *less* correct, 2/5 vs 4/5). It is fenced and the verifier mechanically rejects any plan that re-opens it. Three levers survive. The governing inversion this entire strategy encodes: **the cheapest experiment that can say NO comes first, and saying NO is a win.**

1. **Run a $0 hand-built ceiling/floor probe before EVERY live run.** A research dollar is wasted the moment it is spent on a hypothesis a $0 probe could have killed for free. This is the operational lesson of the session that burned a ~3h confirmatory run on a hypothesis the Attempt-13 ceiling probe could already have flagged as conditional. Every live run is gated behind a passing $0 probe — and the probe is a kill gate, not a warm-up.

2. **Two surviving claims race in PARALLEL on independent tracks, each behind its own $0 gate.** Track A = **governance-prevented-regression under staleness (C4)** — the highest-value-if-true lever, the one a frontier model can show a positive on where raw correctness cannot. Track B = **zero-src SDK onboarding sufficiency (C2)** — structurally orthogonal to the falsified token diagnosis, single clean paired falsifier, rests on the already-proven C1 mechanism. Both lead with the **equal-budget persistence-as-abstraction-vs-transcript control (Arm 2 df.lib vs Arm T raw-trajectory-injection)** — the cleanest intellectual-honesty arm br19 says the prior 7-arm ladder never controlled. An environmental block on one track does not stall the other.

3. **The comparator is br19's pre-registered adversarial bar — Arm 1 (tool-matched inline-rewrite, workspace wiped between questions)** — never an invented "hand-tuned" prompt. A curated/human ceiling (Arm 5) is OPTIONAL, explicitly labelled a *ceiling not a baseline*, with both prompts pre-committed and certified for equal engineering effort.

4. **The verifier asserts process-validity + honest-reporting + per-claim falsification bookkeeping — NEVER an outcome direction.** `claimUpheld=false` is **DONE-HONEST-NEGATIVE = PASS**. Program progression is decoupled from outcome direction: a next rung runs iff the prior rung reached a terminal state AND the next rung is still *decision-relevant* (a pre-registered, outcome-blind predicate) — never "iff the claim was upheld." The verifier **recomputes** every headline number from raw artifacts against a **sealed pre-execution manifest** (which must be BUILT — it does not exist yet), and **types every blocker** (IMPOSSIBLE / USER-GATED / ENVIRONMENTAL / DOABLE) with the typing itself adversarially checkable, not agent-declared.

5. **No NI verdict from an underpowered pilot.** n≈12 cannot establish non-inferiority on a predicted ~0 effect (b+c likely <6). The first live rung is a **PILOT** whose only pre-registered output is the realised p_d/b/c used to size the real run; it is forbidden from emitting an NI verdict. A corpus **hardness screen** (Arm 1 pass-rate materially below ceiling, r>0) gates every live run so no NI "tie" is a saturation artifact.

6. **Positioning is always vs the ephemeral re-derivation regime** (re-derives every session, keeps nothing). SaC validates code-mode-vs-monolith and is *silent* on governed-persistent-library-vs-inline-rewrite, which is our crux. **Never** a literal Search-as-Code head-to-head. The single-session frontier correctness null (C9) is conceded up front; value is claimed on governance-under-staleness, onboarding-sufficiency, persistence-as-abstraction, and turns.

Replayed against this session's honest negative, the verifier terminates cleanly at **DONE-HONEST-NEGATIVE** on the headline (parity held, M\*=+∞ recomputed from raw) with the R4-violating attribution sub-claim flagged **DONE-INVALIDATED** — the 15-cycle loop never happens, because the completion condition was process-validity, not the outcome direction.

---

## 1. The thesis decomposed into falsifiable claims

The thesis: *Datafetch does not virtualize the whole dataset. It virtualizes the dataset INTERFACE, then improves that interface from accepted, evidence-backed work.* The novel conjunction is **(a)** typed primitives visible to the agent (Code Mode surface `df.db`/`df.tool`/`df.lib`), **+ (b)** cross-session interface evolution GATED by accepted, evidence-backed answers (observe → gate → crystallise → govern → persist), **+ (c)** a per-tenant overlay so different agents grow different surfaces. The differentiator is a **second learning timescale**: online, per-tenant, governed crystallisation + persistence, positioned vs the *ephemeral re-derivation regime*. The stated falsifier is the **cold-to-warm flip** (a novel tier-4 composition becomes a tier-2 learned-interface call, same gold answer, lower cost).

Below, each claim carries its regime, endpoint, prior status, and the single number that falsifies it. The C1–C10 numbering is a structuring overlay on the Phase-1 prose findings, not a verbatim artifact label.

| Claim | Regime | Endpoint | Status | Single falsifier |
|---|---|---|---|---|
| **C1 — interface-not-dataset (mechanism)** | Any dataset reducible to collections (+ optional native tools), offline-compile level | `git diff --stat src/ ':!src/eval'` empty after onboarding; generated `df.d.ts` carries the full surface; typecheck 0 / tests green | **proven** | Onboarding a real corpus needs a src/ edit outside `src/eval`, OR the grep-clean/typecheck/test gates regress |
| **C2 — zero-src onboarding correctness** | A live external corpus, DB-shaped fastest (`df.db` + `answerEquals`), `DATAFETCH_AGENT=claude` | Paired pass-rate of zero-src-onboarded agent vs the **Arm 1** bar, k≥5 interleaved, pinned snapshot, pre-registered NI margin | **untested** | NI lower-bound < −5pp on a corpus that passes the r>0 hardness screen |
| **C3 — governance declines bad helpers** | Any answer type the answer-kit covers (numeric/boolean/string/structured); NOT set-equality | Blind false-accept / false-reject counts; adversarial-probe decline rate | **proven** | Blind false-accept >0 or false-reject >0, or a set-equality answer silently passes a wrong helper |
| **C4 — governance-under-staleness** | A corpus where ground truth DRIFTS between crystallise and reuse, with a real correctness signal (r>0; FinChain saturated → disqualified) | Truthfulness = Accuracy − HallucinationRate on the −1 cells; **Arm 2 vs Arm 3** under injected drift, McNemar on discordant pairs, k≥5 | **untested** | Governed truthfulness NOT above ungoverned-persistent (McNemar delta ≤ 0 on −1 cells), OR governance suppresses so many valid reuses that correctness regresses below Arm 1 |
| **C5 — deep-invocable helper, serial-depth, in TURNS** | Serial-dependency-DEPTH (DAG walks), NOT fan-out; bounded out of LLM-cored regimes until `df.llm.*` ships | Paired arm4-warm mean **TURNS** vs arm1's 4.6 at non-inferior correctness, k≥5 | **partial** ($0 ceiling probe done, Attempt 13) | arm4-warm mean TURNS not below 4.6 (delta ≥ 0), OR correctness NI breached |
| **C6 — crystallise→reuse fires** | Fan-out families + mandate-strength preseed | `learnedInterfaceCalls > 0` cross-session; crystallised lib file reused; `helperCallable=true` | **proven** | Loop never fires / helper never called across k≥5 |
| **C7 — per-tenant divergence** | Multi-tenant on a shared mount | Isolation test (tenant A's helper absent from tenant B); divergence metric (uncomputed) | **partial** (isolation proven, value unmeasured) | Tenants interfere (isolation), OR computed divergence ≈ 0 (value) |
| **C8 — persistence-as-abstraction beats transcript** | Cross-session, high reuse density, frontier model | Paired pass-rate/cost of **Arm 2 df.lib** vs **Arm T history-injection** at **equal context budget**, McNemar + Wilcoxon, k≥5 | **untested** | History-injection arm matches/beats the df.lib arm at equal budget (gain is context, not governed abstraction) |
| **C9 — single-session correctness over Arm 1** | Single session, frontier model | Paired McNemar (Arm 2 vs Arm 1) | **partial (≈0/neg)** | Arm 2 ≤ Arm 1 — **expected-false, conceded up front, NOT a value claim** |
| **C10 — cold-to-warm flip with cost drop (general)** | — | — | **falsified** | Already falsified in cheap fan-out; salvageable only by re-scoping into C5/turns |

### Out of scope — the dead cheap-fan-out cost lever (do NOT re-test)

Arm 4 frozen warm reuse beating Arm 1 inline re-derivation on small per-entity tool fan-out (pokeapi/countries/dnd shape). Falsified on a sound harness: M\* = +∞, arm4 cost > arm1 in *every* unit (full-weight −66,521; fresh+output −97; dollar-equiv −6,740) and arm4 less correct (h1x 2/5 vs 4/5). The +66k gap is a **turn-count tax** (arm4 ~+1.8 turns × ~36k arm-invariant cached/turn), not hydration bloat. Also dead and fenced: **shallow crystallised helpers as cost savers** (warm output ≈ inline output); **hydration-bytes / fan-out-width / governance-as-correctness on PokeAPI**; **single-session frontier correctness lift as the PRIMARY value claim** (predicted ~0/negative by SkillsBench −1.8pp, SkillFlow Sonnet-4.6 0.00pp, and directionally confirmed arm2 26/30 vs arm1 27/30); **any literal "beats SaC" framing**; **treating a tier-4→tier-2 collapse as itself proof of value** (the collapse and the cost drop are separable; the collapse fired in the falsified run while cost rose). These are enforced as a **verifier predicate (P7 REGIME-GUARD, §2)**, not merely a plan-review note — strictly stronger, because a dead lever then cannot be mechanically re-opened.

---

## 2. The Better Verifier

### 2.1 What it asserts (and never asserts)

It asserts a **conjunction of process-validity + honest-reporting + per-claim falsification bookkeeping**, with the **outcome direction completely absent** from the completion condition. The verdict (`claimUpheld`) is *computed and recorded*, never *required to be true*. This is the direct repair of the session's category error: the broken hook set `DONE := outcome_predicate` (`PRE-REGISTRATION.md` literally set success as "95% upper CI of M\* ≤ M0"), which is **reality-satisfiable only** — the instant reality returned M\*=+∞, the contract was unsatisfiable for any honest agent (fake the number, or make reality change — both forbidden), and the hook fired forever. A *process* predicate ("a pre-registered, confound-controlled k≥5 run executed and reported its realised endpoint honestly") is by contrast **agent-satisfiable**: the agent can always drive it true by doing the work and telling the truth.

### 2.2 The unified root cause of BOTH failure modes

Over-gating (do-too-little: 3 false blocks this session) and over-production (do-too-much: the Attempt-30 near-miss proxy test) look opposite but share **one root cause: the verifier gave the agent no gradient.** A binary `!DONE` pointing at an unsatisfiable target is a constant, uninformative error; under a relentlessly-firing hook the agent's policy degenerates to oscillation between two locally-rational copes — declare "blocked" (no penalty for a false block) or manufacture a green artifact (discharge the firing hook). **The fix for both is the same:** every fire must emit a **typed, named, checkable next-obligation**, not a binary — `{named unmet predicate, blocker type, concrete action OR Goal-text reservation span, satisfied-set-with-evidence-pointers}`. Over-gating dies because "blocked" now needs a mechanically checkable justification; over-production dies because the published satisfied-set means looking busy cannot discharge an already-green predicate.

### 2.3 Terminal states (many ways to be DONE, one way to keep going)

| State | Meaning | Verifier action |
|---|---|---|
| **DONE-POSITIVE** | process valid, honest, evidence upholds the claim | terminal PASS, stop firing |
| **DONE-HONEST-NEGATIVE** | process valid, honest, evidence *refutes* the claim (`claimUpheld=false`), all PRIMARY invariants held | **terminal PASS** — *the state this session's run should have reached* |
| **DONE-INVALIDATED** | run executed honestly but a PRIMARY pre-registered invariant failed (e.g. the 15 R4 cache-hits), so the affected claim is uninterpretable | terminal PASS ("valid experiment, no interpretable evidence on the affected claim"); split from honest-negative so "void the invariant" cannot launder a refutation |
| **PAUSED-USER-GATED** | a Goal-*text*-reserved input is missing (e.g. the corpus identity) | surface ONE question; **idle** — do NOT re-fire demanding agent action |
| **BLOCKED-IMPOSSIBLE** | the only path needs fabrication / a hard-constraint break, **confirmed by a recomputable proof + a second independent agent** | escalate once to a human, then **STOP firing** |
| **BLOCKED-ENVIRONMENTAL** | an external dependency is unavailable (pinned model, corpus data not in-env, creds) | record the failing dependency; **stop firing**; require env/human change. Does NOT stall independent tracks |
| **IN-PROGRESS** | ≥1 predicate unmet AND typed DOABLE | **fire**, naming the predicate + the concrete action — *the only state that re-fires demanding agent work* |

The session looped because there was **one** terminal-pass state (the positive) and everything else was "keep firing." The fix is **five terminal states + one user-pause**, re-firing only in IN-PROGRESS.

### 2.4 The checkable predicate (recompute, do not trust the report)

The hardest adversarial lesson: **artifact laundering** — a self-consistent but cherry-picked / post-hoc / peeked-at set passes pure provenance-matching, because the artifacts were *manufactured to be consistent*. Two further holes the adversarial phase surfaced are closed here: (i) the sealed manifest these predicates depend on **does not exist yet** and is listed as a build item (§4); (ii) recomputing the *scorer* alone does not defeat **input poisoning** upstream of the scorer (the normalizer + episode emitter, both in dirty in-scope `src/eval` files), so the trust boundary is pushed upstream.

```text
verdict(program, claim):

  # ---- PROCESS VALIDITY (agent-satisfiable; outcome-blind) ----
  P1 PRE-REG-FROZEN:
     prereg.md committed; manifest.prereg_sha == git_sha(prereg.md);
     git-timestamp(prereg) precedes earliest artifact; manifest.dirty_tree == false.

  P2 RUN-CANONICAL (sealed BEFORE execution):
     run-manifest.json (written by the canonical runner BEFORE the seed loop) declares
     {seed_list (|seeds|>=k>=5), model_id, config_hash, scorer_sha, normalizer_sha,
      runner_sha, drop_reasons[]}. An artifact exists for EVERY sealed seed
     (a missing seed => DONE-INVALIDATED, NOT silently droppable); NO extra artifacts
     folded into aggregation; every artifact's config_hash == manifest.config_hash;
     model_id matches the pin. Any drop must be a PRE-REGISTERED, manifest-recorded
     reason committed BEFORE the run -- post-hoc subsetting is forbidden.

  P3 ENDPOINT-RECOMPUTED (trust boundary pushed upstream of the scorer):
     the hook RE-RUNS the committed scorer from raw artifacts AND reproduces every
     headline number (pass-rates, b/c/b+c, CI, NI delta, OR M*/turns); manifest pins
     normalizer_sha + scorer_sha; for a SAMPLED subset the hook re-derives officialPassed
     by re-running the evaluator from raw answer.ts + gold, and re-derives the token
     ledger from the SDK's raw usage logs (NOT the episode's self-reported
     effectiveModelContextTokens). Every headline number resolves to a file:line /
     JSON-pointer; none unprovenanced. (Recomputing the scorer alone is necessary but
     does NOT defeat input poisoning -- stated plainly.)

  P4 INVARIANTS-CLASSIFIED (partition frozen adversarially):
     prereg declares a claim->invariant dependency map, ADVERSARIALLY REVIEWED and
     committed BEFORE the run. R2 (prompt-parity) and R4 (new-argument-held-out) are
     PRIMARY. RULE: an invariant whose violation would otherwise REFUTE the headline
     CANNOT be classified void-on-violation -- DONE-INVALIDATED is reserved for
     invariants ORTHOGONAL to the headline direction (e.g. the arm5a memoization-floor
     cache-hit, which gates only the attribution sub-claim). The hook checks the voided
     invariant does not gate the headline's sign.

  P5 VERDICT-DETERMINISTIC:
     claimUpheld is COMPUTED, not read:
       claimUpheld := endpoint_pass AND NI_pass AND all_primary_invariants_hold AND gates_green
     the report's stated claimUpheld must EQUAL the computed value (true OR false).

  P6 GATES-GREEN:
     pnpm typecheck 0; pnpm test 0; governance probes pass; scorer-determinism probe
     (same artifacts -> same score twice). Necessary, not sufficient.

  P7 REGIME-GUARD (dead-lever fence as a VERIFIER predicate):
     the claim's endpoint does NOT reduce to any deadLevers entry
     {cheap-fan-out cost; shallow-helper cost; single-session-correctness-as-PRIMARY;
      literal-SaC head-to-head; tier-collapse-as-proof}. Mechanically reject if it does.

  # ---- TERMINAL CLASSIFICATION (outcome-blind) ----
  if P1..P7 all hold:
     if any PRIMARY invariant voided   -> DONE-INVALIDATED       (terminal PASS)
     elif computed claimUpheld == true -> DONE-POSITIVE          (terminal PASS)
     else                              -> DONE-HONEST-NEGATIVE   (terminal PASS)
     STOP FIRING.
  else:  # TYPE every unmet predicate; do NOT just demand the positive
     for each unmet predicate U:
       if satisfying U needs fabrication / a hard-constraint break
          AND a recomputable impossibility proof exists
          AND a 2nd independent agent/probe confirms it
                                         -> BLOCKED-IMPOSSIBLE    (escalate once, STOP)
       elif satisfying U needs fabrication BUT the impossibility is UNCONFIRMED
                                         -> IN-PROGRESS           (typing not yet earned)
       elif the Goal text's ENUMERATED reserved-decision list contains U
                                         -> PAUSED-USER-GATED     (one question, IDLE)
       elif U needs an unavailable external dependency (model/corpus/creds)
                                         -> BLOCKED-ENVIRONMENTAL (record, STOP; siblings continue)
       else                              -> IN-PROGRESS: FIRE naming U + the concrete action
     emit the SATISFIED set with evidence pointers   # redundancy guard, kills over-production
```

### 2.5 Blocker typing is itself checkable, not agent-declared

The two self-declaration channels that reproduce the session's failures are closed:

- **USER-GATED keys on a literal ENUMERATED reservation list in the Goal** (machine-readable reserved-decision IDs), **NOT prose-span interpretation.** The session's three false blocks all cited *real* Goal phrases ("anchor on the fundamentals", "stop here") and rationalised "this is foundational → reserved." Because vague-but-real phrases are reservation-span *candidates*, prose adjudication is exactly the judgment the agent was shown to get wrong 3×. If the Goal has no enumerated reserved-ID list, **USER-GATED is unavailable** and the item is DOABLE or IMPOSSIBLE.
- **BLOCKED-IMPOSSIBLE requires a concrete recomputable proof artifact** (e.g. "this predicate needs a value not present in any source row — here is the failing query showing the datum does not exist") **AND confirmation by a second independent agent/probe.** An unconfirmed IMPOSSIBLE claim stays IN-PROGRESS. This closes the new under-gating channel (declare-impossible-to-stop) that the dual of the positive-trap would otherwise open: the verifier recomputes the agent's NUMBERS, so it must also not trust the agent's TYPING.

The `$0-mechanical` claims are honestly re-labelled **adversarial-review-gated**: the branch-coverage "grep for a comparator" check is defeated by prose phrasing ("proceed when the surface proves sufficient" — exactly how the session phrased its gating), so it is *augmented* by an adversarial-agent read asking "is program progression conditioned on outcome direction anywhere, including in prose?"; the redundancy guard maintains an explicit committed predicate→covering-artifact map that the adversarial phase audits, not an ad hoc grep.

### 2.6 How it terminates cleanly on *this session's* honest negative

Replaying Attempt 11's valid run: **P1** holds (`PRE-REGISTRATION.md` frozen, committed `bfce8bd60` before the run). **P2** holds (k=5, pokeapi-pokedex, sonnet-4-6, `confirm-k5-pokeapi-h1x/`). **P3 is the key**: the hook recomputes M\* = +∞ from the raw paired denominators (−66,521 / −97 / −6,740), matching the report; nothing unprovenanced. **P5** computes `claimUpheld := false` (endpoint_pass=false); the report agrees. **P6** green (typecheck 0, 432 tests, probes 4/4). **P7** holds (the run *was* a dead-lever test, but it is the run being *retired*; the guard fires on *future* plans). **P4 is the discriminator**: the 15 R4 violations were on the arm5a *memoization floor* — orthogonal to the headline direction — so the *attribution* sub-claim (depends on R4) is VOID, while the **arm1-vs-arm4 marginal is parity-valid and R4-independent**, so the *primary* M\* endpoint is interpretable and honestly negative. Result: **DONE-HONEST-NEGATIVE** on the headline (claim cleanly refuted, parity held), attribution sub-claim flagged **DONE-INVALIDATED**. **STOP FIRING.** The 15-cycle loop never happens, because the completion condition was process-validity, not the outcome direction.

### 2.7 How a *new* run terminates (every branch maps to a terminal state)

The design target — *every branch of the experiment maps to a terminal state, checkable before the run by listing the branches* — holds for both tracks. Track B (C2): the $0 probe says "interface insufficient" → C2 DONE-HONEST-NEGATIVE for $0; or it clears, the pilot sizes the real run, the powered run produces an NI number → NI holds = DONE-POSITIVE / NI breached = DONE-HONEST-NEGATIVE. Track A (C4): the $0 drift-injector probe declines the stale helper or it doesn't; the live arm2-vs-arm3-under-drift run produces a McNemar delta on the −1 cells in either direction. **There is no result of any rung that leaves the verifier firing.**

---

## 3. The Workflow Strategy

### 3.1 The core embodiment: the branch-coverage gate at pre-registration

The single structural fix that prevents the indefinite-firing trap: **before any run is authorised, the pre-registration must enumerate every possible result branch and show each maps to a terminal state.** A pre-reg is *rejected by the workflow* if any branch lands in IN-PROGRESS. The pre-reg gate (a $0 plan-review subagent) checks:

1. **No outcome direction in the completion condition** — anywhere, including in prose. The endpoint reads "we will measure and report X"; never "X must be ≤ M0 / NI must hold." Checked by an **adversarial-agent read** ("is program progression conditioned on outcome direction anywhere?"), not only a grep for a comparator token.
2. **Decoupled progression.** RUNG N+1 may run iff RUNG N reached a terminal state AND RUNG N+1 is still DECISION-RELEVANT under a pre-registered, outcome-blind predicate (e.g. "RUNG 2 powers C2 iff the pilot's observed delta is inconclusive within [−5pp, +∞]"). **There is no surviving instruction anywhere that reads "proceed only if the claim was upheld."** A DONE-HONEST-NEGATIVE terminates the whole claim's ladder and the program does NOT owe a next rung.
3. **Branch coverage.** Enumerate {upheld, refuted, invalidated-by-invariant, blocked-doable, blocked-impossible, user-gated, environmental} and confirm each has a named terminal/response. Reject if any branch is unmapped.
4. **Dead-lever fence (P7).** Reject any plan whose arms/endpoints re-open a `deadLevers` entry.
5. **$0-probe-precedes-live.** Reject any live run not preceded by a passing $0 ceiling/floor probe for the same claim.
6. **Live-run preconditions materialised.** A $0-probe gate is insufficient when the live run itself depends on net-new arms/corpus. Reject any live-run authorisation unless: the required arms are authored + parity re-passed + typecheck/test green, the corpus is onboarded, the **r>0 hardness screen passed**, and the **sealed run-manifest emitter exists**. (This is the gate that catches the "paper comparator" hole.)

### 3.2 Orchestration topology (subagents / parallelism / adversarial verification)

The workflow that produced *this very document* is the template, hardened:

- **Map (parallel, $0):** decompose claims, postmortem the prior verifier, reconcile methodology+substrate. (Done.)
- **Design (parallel, $0):** N independent full-strategy drafts from distinct angles (verifier-first / regime-first / minimal-decisive) + a judge. Diversity guards against a single framing locking in the dead lever.
- **Pre-reg gate (serial per track, $0):** the branch-coverage gate above. A plan-review subagent that emits APPROVE / REJECT-with-the-unmapped-branch. **This is where the verifier first bites — before any spend.**
- **$0 probe (serial per track):** the kill gate for that track's first live rung.
- **Live run (serial per track):** pilot, then conditionally powered run. Each preceded by its own sealed manifest.
- **Adversarial verification (parallel, $0, after each result):** skeptic subagents attack (a) verifier gameability, (b) falsifiability/regime honesty (is a dead lever sneaking back? is the endpoint where value lives?), (c) tractability/honesty (was the $0 probe actually first? any literal-SaC drift?). Their `mustFix` list is applied before the result is accepted.
- **Synthesize (serial):** the honest report, around whatever way the result broke.

**Parallelism map.** Independent claims run on **independent tracks** (worktree convention `.claude/worktrees/<name>/`, `/`→`+`, branch `worktree-<name>`; check `git status`/mtimes before editing shared files, never blind `git checkout --`). The verifier is the join point. A **BLOCKED-ENVIRONMENTAL on one track (e.g. C4's missing drift injector or a not-in-env corpus) must NOT stall the other track** — Track B's $0 onboarding probe and Track A's $0 drift-injector probe proceed concurrently. Parallelism is reserved for **$0 reasoning work** (map, design, adversarial, probes); **live runs are serial within a track and gated**, because each costs wall-clock and the point is to spend the minimum before a decisive answer.

### 3.3 The anti-thrash loop control (loop-until-dry, not loop-until-positive)

The orchestrator's stop condition is **"every claim in scope has reached a terminal state"** — *not* "the headline came out positive." Per claim it loops: pre-reg gate → $0 probe → (if decision-relevant) pilot → (if decision-relevant) powered run → verdict. The moment the verifier returns any terminal state for a claim, that claim is *dry* and the orchestrator moves on. A claim cannot trap the loop because DONE-HONEST-NEGATIVE / DONE-INVALIDATED / BLOCKED-IMPOSSIBLE / BLOCKED-ENVIRONMENTAL are all dry; PAUSED-USER-GATED is dry-pending (one question, idle); only IN-PROGRESS re-fires, and it must name a concrete doable action. This is the structural inverse of the failed Stop-hook: the failed hook looped on `!DONE_POSITIVE`; this orchestrator loops on `!ALL_CLAIMS_TERMINAL`, and *negative is terminal.*

### 3.4 The redundancy guard (kills over-production)

On every fire the verifier publishes the **SATISFIED set with evidence pointers**, maintained as an explicit committed predicate→covering-artifact map the adversarial phase audits. When the agent considers building a proxy test for something already covered (the Attempt-30 near-over-production: a synthetic "helpers-learned" test when real arm4 data + `tests/sac-nonnumeric-maturity.test.ts` already covered it), the verifier shows "SATISFIED by `confirm-k5-pokeapi-h1x/` + maturity test" and the agent never starts.

---

## 4. The Research Plan

Two surviving claims race in parallel on independent tracks; each lives behind its own $0 gate; the cheapest decisive falsifier within each track runs first; expensive endpoints are gated behind a clear *and* a decision-relevance predicate. The deferred claims (C5, C7, C8-as-standalone) advance via $0 reasoning in parallel without starving the live tracks.

### 4.0 The ladder (cheapest decisive falsifier first, per track)

```
SHARED  ($0)         Pre-reg gate (branch-coverage + decoupled-progression + P7) per track
                     + BUILD the sealed run-manifest emitter (substrate prerequisite)

TRACK A (highest value-if-true) — GOVERNANCE-UNDER-STALENESS (C4)
  A0 ($0)   drift-injector probe (extend the 4/4 governance probes; pure in-process replay)
            + corpus r>0 hardness screen (FinChain disqualified; need an unsaturated corpus)
  A1 ($0*)  live arm2-vs-arm3-under-drift PILOT — realised b/c/b+c on the -1 cells only; NO verdict
  A2 ($0*)  powered arm2-vs-arm3 run, sized from A1's p_d, judge-augmented -1-cell Truthfulness

TRACK B (orthogonal to the dead diagnosis) — ZERO-SRC ONBOARDING (C2)
  B0 ($0)   hand-built onboarding floor probe (end-to-end mount smoke, NOT a biased hand-solve)
            + r>0 hardness screen on the chosen DB-shaped corpus
  B1 ($0*)  C2 PILOT (k=5, ~12Q, single-phase, onboarded-no-learning vs Arm 1 + Arm 0 floor)
            — realised p_d only; NO NI verdict
  B2 ($0*)  C2 powered run, sized from B1 (n = 7.849·p_d/δ²), judge-augmented upper bound

LEAD CONTROL (both tracks) — PERSISTENCE-AS-ABSTRACTION (C8)
  whenever a persistence claim is run, the named control is Arm T (raw-prior-trajectory
  injection at EQUAL context budget) vs Arm 2 df.lib — the cleanest published control br19
  says the prior 7-arm ladder never included.

DEFERRED ($0 reasoning, parallel) — C5 projected-TURNS ceiling probe; C7 divergence metric
```

`$0*` = $0 model spend on Claude Max; wall-clock and the net-new-arm/corpus build cost are real and **honestly budgeted below** — these are NOT "under one hour" reuses of existing arms.

### 4.1 Per-claim plan

**Track A — Governance-under-staleness (C4), the highest-value-if-true lever.** It is the one correctness-adjacent endpoint a frontier model can show a *positive* on where raw single-session correctness (C9) cannot, because the win is *avoided hallucinations* (Truthfulness = Accuracy − HallucinationRate on the −1 cells), and the literature shows ungoverned self-gen *actively regresses* (SkillsBench −1.8pp, negative transfer).

- **Corpus:** a numeric corpus with a real correctness signal that DRIFTS between crystallise and reuse. **FinChain is disqualified (saturated, r≈0).** CRAG (tri-state +1/0/−1 grader, −1 cells are exactly where governance shows truthfulness gain, well-powered at 10pp≈236Q) is the primary candidate, with τ³-bench as the generalisation companion.
- **Arms:** **Arm 2 vs Arm 3** (governed vs ungoverned-persistent) under injected drift. Arm 1 is the floor.
- **Confound battery (the full br19 six, all required here):** tool-matching → Arm 1 tool-matched; prompt-parity (R2, PRIMARY) → blind-diff, never embed a diverging `df.d.ts` in the parity body; online-learning leakage → frozen-replay, two-phase fresh-process freeze, interleaved seeds; model/version drift → pinned dated snapshot, version logged; train/test contamination → n-gram audit, held-out level NEW-ARGUMENT (R4, PRIMARY); **budget-match** → vary Arm 1 token budget, plot accuracy-vs-budget, the governed arm must beat the budget-matched point.
- **Stats:** McNemar on the −1 discordant cells (mid-p when b+c<25, clustered by question across seeds); Hallucination-class F1; k≥5 (k=8 to match τ-bench pass^k); **Wilcoxon signed-rank on the continuous outcome as a CO-PRIMARY**; judge-augmented upper bound with two judges from different families, Cohen weighted κ≥0.80; BH-FDR q=0.05 across domain × head/torso/tail × dynamism slices; same-arm noise floor in every table.
- **Substrate gaps + fixes:** a **drift/staleness injector** (mutate source data between crystallise and reuse; A0 is the $0 in-process-replay version asserting the gate declines the now-stale helper); an **unsaturated correctness corpus** screened r>0; the **br17 `df.tool.*` blockers** (signature collapse, clone fallback, name-collision, db-rooted sub-graph) must be re-probed before any tool-only CRAG run — mitigation is remapping mock APIs onto `df.db.*`, which br17's own db-probe shows *reduces but does not eliminate* the work (comparison/multi-hop still collapse to `FANOUT(db)` and need a render-path fix). **Corpus acquisition is a typed BLOCKED-ENVIRONMENTAL/DOABLE milestone**, not a one-question USER-GATED design choice: (i) pick the CRAG-db-slice (in the `crag-harness` worktree) or acquire BIRD/Spider (not in-env), (ii) port raw data into the run tree or run from the worktree, (iii) build the eval module + MountAdapter, (iv) author gold answers in `answerEquals`-gradeable form. Only the corpus *identity* is legitimately USER-GATED.

**Track B — Zero-src SDK onboarding sufficiency (C2).** Structurally orthogonal to the falsified token diagnosis (no token-amortisation claim, so the +66k turn-tax cannot recur), single clean paired falsifier, rests on the proven C1 mechanism. DB-shaped to use `df.db` + `answerEquals` row-equality and sidestep the br17 `df.tool.*` blockers (BIRD/Spider native-row-shaped corpora are the de-risking fallback for the remap).

- **Arms — the comparator is Arm 1, not an invented "hand-tuned" prompt.** The named comparator is **br19's adversarial bar Arm 1** (tool-matched inline-rewrite, `wipeLibBetweenQuestions:true` as already in `sacArms.ts`), with **Arm 0** as the cheap non-triviality floor. A curated/human ceiling (**Arm 5**) is OPTIONAL, explicitly labelled a *ceiling not a baseline*, with both prompts pre-committed in the pre-registration and certified for equal engineering effort.
- **The onboarded arm must be AUTHORED — it does not exist.** `sacArms.ts` arm2 has `learningEnabled:true, governanceGate:true, interfaceMode:'hooks-draft'` (it crystallises mid-run) — it is NOT a zero-src-onboarded-only arm; conflating the C2 *onboarding* mechanism with arm2's *online crystallisation* in the headline is forbidden. A NEW arm **`onboarded-no-learning`** (`interfaceMode = generated df.d.ts`, `learningEnabled:false`, `governanceGate:null`, `phases:1`) must be authored, then parity gate + typecheck/test re-passed. This is **DOABLE substrate work with a Short–Medium effort estimate, gated behind B0**, before any wall-clock estimate is quoted.
- **Single-phase.** C2 has NO cross-session/freeze component — the entire two-phase freeze machinery (the source of this session's blockers A/B/C) is *removed*. This is why Track B is the clean track.
- **B0 — the honest floor probe (NOT a biased hand-solve).** A no-model human hand-solve by the same person who authored the gold and the comparator is structurally biased to CLEAR and cannot honestly KILL a claim about *model* behaviour. So B0 is **either** (a) a real (non-synthetic) corpus **end-to-end mount smoke** running `df.db` queries against real data and grading a handful of golds with `answerEquals` (the C1 gap the synthetic test leaves open), **or** (b) a $0 single-seed model trace on 3–4 hard questions confirming the model can mechanically reach the surface — with a **pre-registered, reachable fail condition**. A B0 clear is **necessary-not-sufficient**; it never alone licenses spend.
- **B1 is a PILOT, not an NI test.** n≈12 cannot establish NI on a predicted ~0 effect (b+c likely <6; exact test structurally cannot conclude). B1's ONLY pre-registered output is the realised p_d/b/c used to size B2; it is **forbidden from emitting an NI verdict.** Report realised b, c, b+c and the same-arm noise floor regardless.
- **B2 — powered run.** Sized n = 7.849·p_d/δ² from B1's piloted p_d (pushes to ≈70–236Q for any honest δ); rule-based `answerEquals` exact-match primary lower bound; judge-augmented upper bound (two judges, κ≥0.80); BH-FDR across slices; upweight hard cells (multi-hop, set/aggregation question types) per br16.
- **C2 NI endpoint (frozen, NO outcome direction):** "We will report the paired per-question majority-vote pass-rate of the onboarded-no-learning arm and Arm 1, the McNemar b/c/b+c, and the clustered-by-question 95% CI on the difference. NI is claimed iff the CI lower bound > −5pp; otherwise we report 'observed delta X pp, NI not established.' We do not pre-commit to NI." NI is meaningful **only** on a corpus that passes the r>0 hardness screen (Arm 1 pass-rate materially below ceiling, e.g. <85%) — added to B0's gate so a trivially-NI saturated result cannot be reported as a C2 clear.

**Lead control for any persistence claim — C8 (persistence-as-abstraction vs transcript).** Whenever Track A or any C4/C2 persistence endpoint runs, the named control is **Arm T** (raw-prior-trajectory injection at EQUAL context budget) vs **Arm 2 df.lib**. This is the cleanest published intellectual-honesty control (the SkillFlow 51.04% history-injection vs 71.08% skills-evolve contrast ported to datafetch), and br19 notes the prior 7-arm ladder omitted it. Stats: McNemar + Wilcoxon on cost at equal budget.

**Deferred ($0 reasoning, parallel).** **C5** — a second $0 ceiling probe measuring projected TURNS (one-shot call vs inline DAG exploration) on hand-authored serial-depth trajectories, before committing the substrate change (the observer crystallises shallow today — `src/observer/author.ts`/`template.ts` hardwire `lib.toolFanout`; deep+invocable crystallisation or a preseed is required); live run measures TURNS as primary, never tokens. **C7** — the divergence metric is a $0 offline computation, low priority.

### 4.2 Substrate readiness for the live tracks (gaps + fixes)

| Need | State | Fix / effort |
|---|---|---|
| Zero-src onboarding mechanism (4 public steps) | **PROVEN** (`tests/sac-zero-src-onboarding.test.ts`, C1) | none |
| `df.db.*` + `answerEquals` row-equality grading | **PROVEN** (numeric/boolean/string/structured) | none |
| Prompt-parity masking (mask learned `df.lib.*` block) | **FIXED** (blocker C resolved) | reuse as-is |
| Single-phase paired runner (no freeze) | the 7-arm runner supports single-phase arms | use the new onboarded-no-learning arm + Arm 1 + Arm 0; no two-phase machinery |
| **`onboarded-no-learning` arm** | **MISSING** — must author (arm2 is learning-on, NOT this) | new arm in `sacArms.ts`; re-pass parity + typecheck/test; Short–Medium |
| **Sealed run-manifest emitter** | **MISSING** — the runner emits only per-`(arm,seed,phase)` `run-info.json`, lacking prereg_sha/config_hash/scorer_sha/normalizer_sha/runner_sha/dirty_tree/seed_list | **BUILD as a prerequisite to ANY verifier predicate:** the runner writes ONE atomic `run-manifest.json` BEFORE the seed loop and REFUSES to launch if `git status --porcelain` is non-empty. Until it exists, P1/P2/P3-clean-tree are correctly typed **BLOCKED-ENVIRONMENTAL/DOABLE**, not asserted-checkable-today |
| **Never-seen DB-shaped corpus with gold** | **MISSING / not-in-run-tree** (CRAG-db-slice lives in the `crag-harness` worktree; BIRD/Spider not in-env) | typed corpus-acquisition milestone (§4.1 Track A); the corpus *identity* is the one USER-GATED input |
| Drift/staleness injector (C4) | **MISSING** | A0 $0 in-process-replay probe extends the 4/4 governance probes |
| Deep+invocable crystallisation (C5) | **MISSING** (observer crystallises shallow) | substrate change in `src/observer/author.ts`+`template.ts`; gated behind the C5 $0 TURNS probe |
| `df.llm.*` primitive (LLM-cored C5) | **NOT shipped** (grep-clean across src/) | bounds the LLM-cored island out until it ships |
| `answerEquals` set-equality | **MISSING** (C3 gap) | pick a corpus whose answers are numeric/boolean/string/structured to avoid it for the minimal runs |

---

## 5. Honesty guardrails (carried into every artifact)

1. **Framing — vs the ephemeral re-derivation regime, never a literal SaC head-to-head.** SaC validates code-mode-vs-monolith (the Arm 0 contrast) and keeps helpers ephemeral; it is *silent* on governed-persistent-library-vs-inline-rewrite (Arm 1, our crux). The differentiator is framed as a **second learning timescale** — online, per-tenant, governed crystallisation + persistence. No "structurally cannot" or "beats SaC" language. The pinned claim sentence: *"On a corpus selected because reuse/onboarding is structurally necessary, a governed persistent / zero-src interface delivers [endpoint] that the ephemeral regime cannot, at non-inferior correctness."*
2. **Concede the single-session correctness null (C9) up front.** Expected-false on frontier models (SkillsBench −1.8pp; SkillFlow Sonnet-4.6 0.00pp; directionally confirmed arm2 26/30 vs arm1 27/30). The program does **not** rest on it; value is claimed on governance-under-staleness (C4), onboarding-sufficiency (C2), persistence-as-abstraction (C8), and turns (C5).
3. **Never pre-commit to a positive.** Every pre-registered endpoint reads "we will measure and report"; the NI/success rule is stated, but the *completion* condition is the *reporting*, not the *direction*. `claimUpheld=false` is a PASS. Program progression is decoupled from outcome direction (§3.1 #2).
4. **Always report realised b, c, b+c, CIs, M\*/turns, and the same-arm noise floor.** Mid-p McNemar when b+c<25; cluster by question across seeds; one confirmatory test at α=0.05; slices under BH-FDR q=0.05; Wilcoxon co-primary on the continuous endpoint.
5. **Disclose post-hoc selection.** Any easier-corpus / easier-family choice is disclosed as legitimate for an existence proof and disqualifying only for a generality claim, which is not made. Any seed/family drop must be pre-registered and manifest-recorded *before* the run; post-hoc subsetting is forbidden.
6. **Recompute, don't trust the report.** The verifier re-derives every headline number from raw artifacts, pushes the trust boundary upstream of the scorer (re-derive officialPassed from raw answer.ts+gold and the token ledger from raw SDK usage logs on a sampled subset), and checks exact seed coverage against the sealed pre-execution manifest. Provenance-matching alone is launderable; recomputing the scorer alone does not defeat input poisoning.

---

## 6. Milestones (cheapest decisive falsifier first; parallel tracks)

| # | Milestone | Cost | Terminal-state options |
|---|---|---|---|
| M0 | Pre-reg gate passes per track (branch-coverage, no-outcome-direction-incl-prose, decoupled-progression, P7 dead-lever fence, $0-probe-precedes-live, live-run-preconditions-materialised) **+ build the sealed run-manifest emitter** | $0 | APPROVE / REJECT-with-unmapped-branch / BLOCKED-ENVIRONMENTAL(manifest not built) |
| A0 | **Track A** drift-injector $0 probe + r>0 corpus screen | $0 | CLEAR→A1 / **C4 DONE-HONEST-NEGATIVE** / BLOCKED-DOABLE(injector) / BLOCKED-ENVIRONMENTAL(corpus) |
| A1 | Track A arm2-vs-arm3-under-drift PILOT (realised b/c/b+c on −1 cells; NO verdict) | $0*, build+run | sizes A2 / DONE-INVALIDATED |
| A2 | Track A powered governed-vs-ungoverned run (judge-augmented, budget-matched) | $0*, ~1d | DONE-POSITIVE / DONE-HONEST-NEGATIVE / DONE-INVALIDATED |
| B0 | **Track B** honest onboarding floor probe (end-to-end mount smoke OR $0 model trace, reachable fail condition) + r>0 screen | $0* | CLEAR→B1 / **C2 DONE-HONEST-NEGATIVE** / BLOCKED-DOABLE(predicate ext) / USER-GATED(corpus identity) |
| B0.5 | Author `onboarded-no-learning` arm; re-pass parity + typecheck/test | $0 | DOABLE / blocks B1 until materialised |
| B1 | Track B C2 PILOT (k=5, ~12Q, single-phase, onboarded-no-learning vs Arm 1 + Arm 0; realised p_d only; NO NI verdict) | $0*, build+run | sizes B2 / DONE-INVALIDATED |
| B2 | Track B C2 powered run (n=7.849·p_d/δ², two judges κ≥0.80, BH-FDR) — only if decision-relevant | $0*, ~1d | DONE-POSITIVE / DONE-HONEST-NEGATIVE |
| C8 | Persistence-as-abstraction control (Arm T vs Arm 2 at equal budget) run alongside any persistence endpoint | $0*, build+run | DONE-POSITIVE / DONE-HONEST-NEGATIVE |
| M5 | Deferred: C5 projected-TURNS $0 ceiling probe; C7 divergence metric | $0 | CLEAR→deep-crystallisation substrate change then live TURNS run / DONE-HONEST-NEGATIVE |

Every $0 probe (A0, B0, M5) can **kill its claim for free** and terminate cleanly at DONE-HONEST-NEGATIVE. Every live run is preceded by its $0 gate, its materialised preconditions, and a sealed manifest; every powered run is gated behind a clear *and* a decision-relevance predicate, never an outcome direction. The two tracks run in parallel so an environmental block on one (C4's corpus/injector) does not starve the other (C2's clean single-phase path).

---

**Relevant files (all absolute):**
- `/Users/jayfarei/src/tries/2026-05-01-hackathon/experiments/2026-06-sac-poc/ceiling-probe/CEILING-PROBE.md` — the $0-probe pattern this strategy generalises
- `/Users/jayfarei/src/tries/2026-05-01-hackathon/experiments/2026-06-sac-poc/PHASE-1-FINDINGS.md` — the falsified cost lever + surviving differentiators
- `/Users/jayfarei/src/tries/2026-05-01-hackathon/experiments/2026-06-sac-poc/PRE-REGISTRATION.md` — the pre-reg template (and the "95% upper CI of M\* ≤ M0" outcome-as-completion defect the branch-coverage gate repairs)
- `/Users/jayfarei/src/tries/2026-05-01-hackathon/experiments/2026-06-sac-poc/ONBOARDING.md` — the proven zero-src mechanism (C1) and the explicitly-unverified end-to-end half (C2)
- `/Users/jayfarei/src/tries/2026-05-01-hackathon/experiments/2026-06-sac-poc/RUN-LOG.md` — Attempts 11 (valid negative), 13 ($0 ceiling probe), 18–30 (the three false blocks)
- `/Users/jayfarei/src/tries/2026-05-01-hackathon/eval/skillcraft/results/sac-poc/confirm-k5-pokeapi-h1x/` — the valid confirmatory run artifacts the verifier recomputes
- `/Users/jayfarei/src/tries/2026-05-01-hackathon/eval/skillcraft/scripts/run-sac-poc.sh` — the runner (single-phase arms, `--seeds`, `--reuse-level`, `--live`, `--m0`) that must gain the sealed run-manifest emitter
- `/Users/jayfarei/src/tries/2026-05-01-hackathon/eval/skillcraft/scripts/score-cross-arm.ts` + `p1-paired-analysis.py` — the scorer the verifier RE-RUNS (P3 recompute); trust boundary pushed upstream to `normalize-results.ts` + the episode emitter
- `/Users/jayfarei/src/tries/2026-05-01-hackathon/src/eval/sacArms.ts` — the 7-arm config; the new `onboarded-no-learning` arm must be authored here (arm2 is learning-on, not the onboarding arm)
- `/Users/jayfarei/src/tries/2026-05-01-hackathon/src/observer/author.ts` + `template.ts` — where shallow `lib.toolFanout` crystallisation is hardwired (the C5 deep-crystallisation gap)
- `/Users/jayfarei/src/tries/2026-05-01-hackathon/src/eval/skillcraftFullDatafetch.ts` — emits per-`(arm,seed,phase)` `run-info.json` today; must emit the pre-execution sealed `run-manifest.json`
- `/Users/jayfarei/src/tries/2026-05-01-hackathon/kb/br/19-skill-library-baseline-ladder-and-paired-eval-methodology.md` — the 5-arm ladder, the six-confound battery, the stats stack, and the Arm T persistence-as-transcript control