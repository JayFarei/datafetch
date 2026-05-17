# Post-Iter164 Research Digest: Four New Papers, Mapped to Substrate

This digest extends `docs/goal4-academic-design-directions.md` (which
already covers ReGAL, SkillX, PSN, When2Tool, and the original Memory
paper). The four papers below were surfaced this turn and map to
concrete substrate targets.

The user's synthesis is at the bottom: the four mechanisms together
form a four-part fix that maps directly to ReGAL + SkillX + PSN +
Memory Transfer respectively.

---

## Paper 5 — Memory Transfer Learning (arxiv 2604.14004)

### Mechanism

The paper studies how memories of past task executions transfer across
domains and reports a clean taxonomy of memory representations, ranked
by transfer performance on novel domains:

1. **Trajectory** (lowest). The raw step-by-step record of what the
   agent did. Carries entity names, file paths, exact tool arguments,
   exact tool outputs.
2. **Workflow** (medium). The trajectory abstracted to a sequence of
   action templates with slots. Still references the original entities
   by category.
3. **Summary** (good). A prose summary of what happened, with
   entity-specific detail collapsed.
4. **Insight** (best, **+7.8% on novel domains** vs the trajectory
   baseline). A short statement of the abstract principle the trace
   demonstrated. Example: "Before computing a ratio over two metrics,
   verify both metrics share the same period and unit, otherwise the
   ratio is meaningless." No file names, no entity references, no
   tool-bundle names. Just the transferable lesson.

The key finding: the higher the abstraction, the better the transfer.
The Insight format strips the surface noise that makes trajectories
look domain-specific and leaves only the generalisable rule. The agent
reads the insight BEFORE deciding to invoke the associated helper, so
the insight functions as a *selection signal*, not just a usage
example.

### Our Equivalent Today

We have:

- **Trajectory:** `tmp/runs/N/source.ts` (every successful snippet is
  retained verbatim).
- **Workflow:** the `df.lib.*` learned helpers themselves — they
  abstract the call sequence into a single primitive.

We do NOT have:

- **Summary:** no per-helper prose description of what the trajectory
  actually accomplished. The frontmatter `description` block
  (`src/observer/author.ts:1962-1997`) is template-generated from the
  call graph, not the trajectory's *semantic* outcome.
- **Insight:** no abstract-principle field. The closest is the
  `intent` string baked into `fn(...)` (`src/observer/author.ts:1901-1903`),
  but that's "reusable learned interface for the X intent shape;
  internally composes Y" — describing the shape, not the lesson.

### Concrete Fix

Add an `@insight` YAML field to the crystallised-helper frontmatter,
stamped at author time and surfaced at discovery time. Format:

```yaml
insight:
  title: Compare period-normalised metrics before computing ratios
  description: |
    A fan-out over entities that ends in a ratio calculation must
    confirm both numerator and denominator come from the same reporting
    period, otherwise the ratio represents nothing in the world.
```

The agent reads the insight BEFORE deciding whether to invoke the
helper. This is what enables semantic selectivity — currently the
agent only sees the call-graph shape and has to infer from the example
whether the helper matches its task. With an insight string, the
selection becomes a fast lexical match against the task statement.

The Insight content can be generated at promotion time by a small LLM
pass that reads (trajectory question + recorded outcome) and emits the
principle. This avoids polluting every promotion with a sync LLM call:
do it inside the gate path only after the helper has cleared shape +
maturity gates.

### Target Files

- `src/observer/author.ts:1934-1950` — `headerComment` is where
  `@shape-hash` and `@intent-signature` are stamped. The `@insight`
  stamp goes alongside, with a multi-line content block.
- `src/observer/author.ts:1962-1997` — `frontmatter`'s YAML block
  needs an `insight` field.
- `src/snippet/library.ts` — `LibraryEntry.spec.intent` is the field
  surfaced to the agent today; an `insight` sibling needs to be wired
  through `FnSpec` so it lands in the discovery payload.
- `src/discovery/librarySearch.ts:25-46` — `RankedFunction` and
  `scoreSynthetic` need to score against the insight text (likely with
  a higher weight than the call-graph slug, since insight is the
  semantic carrier).
- `src/server/manifest.ts` — the manifest entry shape needs the field.

### Estimated Effort

- Wire-up + frontmatter stamping + discovery payload: **4-6 hours.**
- LLM call to generate the insight string at promotion time, with a
  cached fallback when LLM is unreachable: **2-3 hours.**
- Discovery ranking integration + tests: **3-4 hours.**

Total: **~10-12 hours** for a first end-to-end pass.

### Risk

The naive risk: a bad insight string actively *misleads* the agent
into calling the helper for the wrong task. A template-generated
insight ("repeated tool fan-out for entities") would be no worse than
today's intent string but also no better. The LLM-generated insight
needs a validation gate — e.g. "the insight string mentions at least
one concept from the originating trajectory's question" — to avoid
hallucinated principles that don't match the actual helper.

### Prerequisites

- The author-pipeline's existing shape/intent gates (already in place).
- A library-discovery payload that accepts a multi-line field
  (currently the `intent` field is a single line; some wire formats
  may need to grow).
- An idempotency story for the LLM-insight call so re-authoring the
  same helper doesn't burn fresh tokens each promotion.

---

## Paper 6 — From f(x) and g(x) to f(g(x)) (arxiv 2509.25123)

### Mechanism

Studies how LLMs learn to compose atomic skills into compositional
ones. Key findings:

1. Atomic skills must be **fully internalised first** — partial
   internalisation of the atomic skill leaks failure into the
   composition.
2. Composition must be **trained separately** from the atomic skills.
   Trying to learn both at once produces neither.
3. The model learns **when composition applies** through binary reward
   on the compositional task, not through prompt engineering.

The paper uses an RL setup to demonstrate. The transferable insight
for non-RL substrates: composition is a separate skill that needs its
own gradient signal. You can't get it by listing the atomic skills and
hoping the agent figures out the chain.

### Our Gap

`df.lib.*` functions are presented to the agent as flat, independent
tools. There is no representation of "this function's output is a
valid input to that function." When the agent encounters a task that
needs two helpers chained, it has to discover the chain at call time
from the schemas alone.

This is visible in `score-r1-r9.ts:836-1120`'s compositional
diagnostics block: clusters with intentSignatures like
`db→FANOUT(tool)→FANOUT(lib)→FANOUT(tool)` show up with only 2-3
trajectories and no callable helper that covers them. The substrate
*can* generate component helpers (`recordToolFanout` covers
`db→FANOUT(tool)→lib`) but doesn't have a way to learn that the
remaining tail `→FANOUT(tool)` should be composed onto the result.

The R6 compositional-clusters failures in the iter164 scorecard are
exactly this: composition-not-learned-yet.

### Concrete Fix

Annotate helpers with composition relationships. Stamp two new fields:

```yaml
composes-with:
  - name: recordToolFanout
    relation: feeds-into
    via-field: results[].entity
    confidence: 0.85
  - name: toolFanoutEnrichment
    relation: extends
    when: intent-signature equals db→FANOUT(tool)→lib→FANOUT(tool)
```

The relationships come from the offline cluster analysis: if cluster
A's intentSignature is a prefix of cluster B's, A's helper is a
candidate predecessor of B's. The substrate learns the composition
DAG as a side-effect of clustering, not as a separate task.

At call time, the agent sees in the discovery payload not just the
helper but the helpers it composes with — this is the "compositional
suggestion" surface.

The substrate-side mechanism for "training composition separately":

- Composition is gated by a separate maturity counter. A composition
  edge is `candidate` until two trajectories show the chain
  succeeding, then `verified`. This is the PSN state machine applied
  at the edge level, not the node level.

### Target Files

- `src/observer/author.ts:1934-1950` — `headerComment` stamps the
  `@composes-with` field alongside `@shape-hash`/`@intent-signature`.
- `src/observer/template.ts:223-252` — `computeIntentSignature` is
  already prefix-aware (the `containsContiguousSubIntent` check in
  `score-r1-r9.ts:204-215` mirrors it offline). Extending the offline
  analysis to emit composition edges is the smallest possible step.
- `eval/skillcraft/scripts/intent-cluster-analysis.ts` — already
  computes data-shape-agnostic clusters; the prefix-relation pass
  needs to land here. The output JSON gains a `compositions[]` array:
  edges between clusters where one's signature prefix-matches
  another's.
- `eval/skillcraft/scripts/score-r1-r9.ts:836-1120` —
  compositionalDiagnostics is already the diagnostic surface; it can
  be promoted to gating once composition edges are first-class.

### Estimated Effort

- Compute composition edges in the offline cluster pass: **3-4 hours.**
- Stamp `@composes-with` in helper frontmatter: **2-3 hours.**
- Surface edges in discovery payload: **2-3 hours.**
- Edge-level maturity counter (PSN state machine at the edge): **6-8 hours.**

Total: **~13-18 hours** to land composition as a first-class concept.

### Risk

The substrate fragments composition into too many micro-helpers. Today
we have 4 authored fan-out shapes; with composition edges, every
prefix relationship spawns a candidate composition. We could end up
with a combinatorial explosion of "do X then Y" helpers whose
individual value is marginal. Mitigation: gate composition edges
behind a usage-frequency floor (the composition only counts if its
prefix and suffix appear in ≥ 3 distinct successful trajectories).

The second risk: the agent learns to over-compose. If every helper
advertises composition partners, the agent's planning step blows up
combinatorially. Mitigation: only surface the highest-confidence edge
per helper, not all of them.

### Prerequisites

- Paper 5's insight stamping is helpful here — the insight string is
  what disambiguates which edge to suggest when multiple are
  available.
- The substrate needs trajectory-level provenance for composition
  edges (which trajectories demonstrated which chain). This is
  partially in `helper-instrumentation.jsonl` today but not in a form
  amenable to edge extraction.

---

## Paper 7 — UCT: Self-Evolving Tool Creation (arxiv 2602.01983)

### Mechanism

UCT (the framework name — Unified Creation + Testing) addresses the
question: when an agent needs a new tool, how do you stop the creation
process from polluting the main task context AND ensure the resulting
tool is actually correct? The pieces:

1. **Build Loop isolation.** Tool creation runs in a separate context
   from the main task. The main task sees only the *result* (tool
   reference or failure), not the creation chatter.
2. **Generate code + test script in one pass.** The Build Loop emits
   the implementation AND the verification harness simultaneously,
   forcing the model to commit to a contract.
3. **Sandbox execution.** Tests run in an isolated sandbox so
   creation-time failures don't poison the main task's state.
4. **Critic model review.** A separate model reviews the (code, tests,
   sample input/output) tuple for quality. The critic asks the
   semantic question, not just the structural one: "Is this function's
   contract actually satisfied by the entities it will encounter?"
5. **Only verified+reviewed tools enter the library.**

The Critic is the missing semantic validator. The structural validator
("does the code run without errors?") is necessary but insufficient —
many runtime-clean tools produce wrong results. The Critic's role is
to detect "ran fine but answered the wrong question."

### Our Equivalent Today

- **Build Loop isolation:** partial. The observer/author runs after a
  successful episode, not interleaved with the agent's flow. The
  episode itself is the trajectory; the author crystallises from a
  recorded trajectory. So creation does not pollute the agent's
  context, but the trajectory's success is the only signal driving
  authoring.
- **Test script:** none. The author emits the helper and an
  `examples[]` block (`src/observer/author.ts:704-708`), but no
  verification harness runs against the example.
- **Sandbox:** the snippet runtime is sandboxed
  (`src/snippet/runtime.ts`) but the helper-creation path doesn't
  re-execute the helper against the source trajectory.
- **Critic:** none. The hook registry quarantines on runtime failure
  (structural, `src/observer/gate.ts`), but there's no semantic
  validator that asks "did this helper produce the value the original
  snippet produced?"
- **Promotion:** crystallised helpers enter the library after passing
  shape-dedup and intent-signature checks. Semantic equivalence to
  the source trajectory's outcome is not verified.

### Concrete Fix

Add a critic-style replay step before promotion:

1. After the author emits a candidate helper, immediately execute it
   in a sandbox against the source trajectory's records (records are
   already mounted in the dataset harness).
2. Capture the helper's output.
3. Compare structurally to the source trajectory's last-call output.
   If the outputs deep-equal (or pass a relaxed equivalence rule —
   same keys, same primitive-typed values), promotion proceeds.
4. If not, the helper goes into a `pre-quarantine` state. A second
   LLM call (the Critic) reviews the diff and either:
   - Approves the promotion if the diff is intentional (e.g. the
     helper aggregates results the original snippet returned
     row-by-row), OR
   - Rejects, sending the helper to quarantine without ever entering
     `helpersAvailable`.

This is the ReGAL gate done properly. ReGAL itself uses a verification
oracle; UCT formalises the critic role as a separate model with a
focused prompt.

### Target Files

- `src/observer/author.ts` — after the author returns the rendered
  source, insert a `replayAndVerify` step before
  `stampPromotionMetadata` (called around `:173`). The replay
  re-executes the helper against the trajectory's first call's input
  context.
- `eval/skillcraft/scripts/fanout-slot-diagnostics.ts` — already does
  slot-level verification of fan-out helpers (compares the helper's
  per-slot output against the recorded call's per-slot output). Extend
  to full-helper replay, returning a unified pass/fail.
- `src/observer/gate.ts` — add a `criticVerdict` field to the gate
  decision. When critic rejects, the helper is filtered before being
  added to `helpersCreatedThisEpisode`.
- `src/snippet/library.ts` — needs a `verifiedAgainstSource: true`
  flag on the manifest entry so downstream consumers can distinguish
  semantically-verified helpers from shape-only ones.

### Estimated Effort

- Replay-and-verify against source trajectory: **6-8 hours** (the
  hardest part is reconstructing the call's input context out of the
  trajectory record).
- Critic prompt + LLM integration: **4-6 hours.**
- Gate-side rejection plumbing: **2-3 hours.**
- Tests, regression on existing iter164 helpers: **4-6 hours.**

Total: **~16-23 hours** for full critic integration.

### Risk

Replay flakiness. The source trajectory was recorded against a
mounted dataset that may no longer be in identical state at author
time (records might have been added/changed). Mitigation: snapshot
the records used by the source trajectory at recording time, replay
against the snapshot rather than the live dataset.

The critic is itself a model and can be wrong. A false-positive
rejection burns a perfectly good helper; a false-negative approval
lets a bad helper through. Mitigation: log critic decisions to a
review queue so humans can audit a sample; weight the critic's
verdict against the structural replay's verdict (require both to
agree before rejection).

LLM cost for the critic. Every promotion now triggers an LLM call.
Mitigation: only run the critic when structural replay produces a
non-trivial diff. Identical outputs skip the critic entirely.

### Prerequisites

- The replay step needs access to the original trajectory's data
  context (the records the source snippet was reading from). This is
  partially available in `tmp/runs/N/trajectory.json` but doesn't
  include the dataset state snapshot. The dataset harness needs to
  emit a snapshot reference.
- `fanout-slot-diagnostics.ts`'s existing slot verification is the
  precursor — its output shape is what `replayAndVerify` returns at
  helper granularity.
- Paper 5's insight stamping is independent but synergistic — the
  critic prompt benefits from the insight string as context for what
  the helper claims to do.

---

## User's Synthesis: The Four-Part Fix

The user surfaced the synthesis that ties the four mechanisms above
together with the three already in `docs/goal4-academic-design-directions.md`:

| Mechanism | Maps To | What It Fixes |
|---|---|---|
| Precondition-aware interfaces | ReGAL | The interface contract is verified against the trajectory's preconditions before promotion. Avoids helpers that pass shape gates but fail in the wild. |
| Verification-gated promotion | SkillX | A helper enters the multi-level hierarchy only after passing both structural (shape) and semantic (replay) verification at its level. |
| Maturity + fault localization | PSN | The state machine's state machine — track per-helper attempts/passes/wins/losses, and when a helper fails, attribute the failure to the specific helper rather than the trajectory. |
| Insight layer | Memory Transfer | The agent reads an abstract-principle string before deciding to invoke the helper. Selectivity becomes lexical and fast, not inferential and slow. |

The four parts compose as a pipeline:

1. **Cluster trajectories** by intent signature (current substrate, +
   composition edges from paper 6).
2. **Author candidate helper** from the cluster's exemplar trajectory.
3. **Verify the candidate** structurally (current shape gate) AND
   semantically (paper 7's critic replay).
4. **Promote with insight stamp** (paper 5) and composition edges
   (paper 6).
5. **Track maturity per helper AND per composition edge** (paper PSN,
   extended to edges).
6. **Surface to agent** with insight string as primary selection
   signal, composition edges as secondary chaining hints.

The fault localization piece (paper PSN) is the safety net: when a
mature helper starts failing, the substrate downgrades the specific
helper to `suspect` rather than blaming the trajectory as a whole.
This is what keeps the library trustable as it grows.

## What To Build First

Ordered by ratio of (impact on R6/R7/R8) to (implementation effort):

1. **Paper 5's insight stamping** (~10-12 hours). Highest semantic
   leverage for the lowest substrate complexity. The agent's reuse
   rate (R7) is bounded by its ability to recognise that a helper
   matches the task; today that recognition is template-shape only.
   An insight string is the cheapest known way to lift R7.

2. **Paper 7's critic replay** (~16-23 hours). The R4 quarantine rate
   already catches structural failures; the critic catches the
   semantic ones (helpers that run clean but answer wrong). This is
   the missing safety gate that lets us trust the library as it
   grows past 5-10 helpers.

3. **Paper 6's composition edges** (~13-18 hours). Pays off when the
   substrate has enough helpers that chaining becomes the dominant
   reuse mode. Today with 4-5 helpers the marginal value is modest;
   beyond 10 helpers it becomes essential.

The order matches the user's "interface → verification → maturity
→ insight" mental model in reverse implementation order, because
*insight* is the lowest-effort piece that unblocks the higher-effort
work. Paper 7 (critic) needs Paper 5 (insight) to write good critic
prompts. Paper 6 (composition) needs Paper 5 to disambiguate which
chain to suggest.
