---
title: "Agentic Search for Context Engineering (Leonie Monigatti / Elastic, AI Engineer Europe 2026)"
date: 2026-05-29
mode: scan
sources: 11
status: complete
---

# Agentic Search for Context Engineering (Leonie Monigatti / Elastic, AI Engineer Europe 2026)

## Executive Summary

This is a one-hour AI Engineer workshop by Leonie Monigatti (Developer Advocate, Elastic) that argues context engineering is "about 80% agentic search", and then walks three live demos that span the exact interface-design axis our substrate lives on: a specialized semantic-search tool, a general-purpose database query tool (ESQL) hardened with an Agent Skill, and a shell tool over a local filesystem extended with a custom semantic-grep CLI (`jina-grep`). The single most useful idea for us is her framing of the whole design space as **low floor vs high ceiling**: specialized tools have a low floor (simple parameters, the agent rarely errs, one call, cheap model) but a low ceiling; general-purpose tools (shell, raw query execution) have a high ceiling (handle unexpected queries) but a high floor (more parameter errors, more iterations, needs a stronger model). The recommended practice is to curate a *combination* rather than chase one silver bullet. That is a clean external vocabulary for what datafetch already does, the typed `df.d.ts` namespace is the low-floor surface, code-mode `exec` is the high-ceiling surface, and crystallised `lib/<tenant>/*.ts` helpers are the act of *lowering the floor on a high-ceiling tool after observing usage*.

The second high-value idea is independent, third-party validation of our crystallisation thesis. Monigatti's explicit recommendation when you do not yet know your agent's query behavior is: **start with a general-purpose tool, log the agent's behavior, watch for breaks (four to five tool calls per question is the tell), then carve out a purpose-built specialized interface for the patterns you see.** She describes doing exactly this against her own OpenClaude `exec` tool over three days, then asking the agent what patterns it saw, and the agent recommended specific search tools to build. That is the datafetch observe-gate-crystallise loop, discovered independently by a retrieval practitioner at a search vendor, and it lands the day after our CRAG shape-probe ([`17-crag-shape-probe-findings.md`](17-crag-shape-probe-findings.md)) found our crystalliser authoring literal-clone helpers. Her failure taxonomy (agent calls no tool, calls the wrong tool, generates wrong parameters) and her tool-description discipline (core purpose, then trigger conditions, then relationships, then reinforce in the system prompt) are directly actionable on the two open substrate defects: coarse intent signatures and wrong-answer warm reuse.

The third takeaway is a benchmark pointer we should track for the CRAG phase: she cites a Vercel experiment ("is bash all you need") where a **hybrid agent with both a bash tool and a database tool beat either alone**, by running the database tool first and then verifying results with the shell. That is a concrete, citable design for the two-corpus CRAG eval ([`16-substrate-benchmark-scouting.md`](16-substrate-benchmark-scouting.md)): pair the typed data interface with a shell/grep verification pass rather than treating them as competing arms.

## Overview

**What it is.** A conference workshop (video, ~50 minutes plus Q&A) plus a public companion repo, `github.com/iamleonie/workshop-agentic-search`. The repo is small and pedagogical: three Jupyter notebooks built on `langchain` v1.2.12 and `langchain-openai` v1.1.11, a local Elasticsearch instance as the database context source, the AI Engineer Europe conference schedule as the toy corpus (one document per session), three system-prompt markdown files, and four architecture diagrams. It is not a product or a library to adopt; it is a clearly-argued mental model with runnable evidence behind each claim. The author works at Elastic and frames everything through retrieval, but explicitly says she "does not discriminate" and spends a third of the talk on the filesystem-plus-shell path that competes with her own employer's database.

**Why it matters to us.** Every brief from [`01-voyage-ai-code-mode-data-interface.md`](01-voyage-ai-code-mode-data-interface.md) through [`14-codex-code-mode-strategic-implications.md`](14-codex-code-mode-strategic-implications.md) has been arguing one half of this space (code-mode data interfaces, VFS, shell-over-dataset). This workshop is the first source we have that lays the *entire* search-tool landscape side by side, names the trade-offs in UX terms (low floor / high ceiling), and gives an explicit decision procedure for when to build a specialized interface. It is the missing "why curate interfaces at all" framing that sits one level above our substrate mechanics. Traction signals are modest (a workshop repo, not a framework), so the value here is conceptual and validating, not a dependency to take on.

## How It Works

The workshop is organized around one recurring diagram: the agent loop where an LLM, given a user message, decides whether to call a context-retrieval tool, the tool pulls from a context source, and the result lands in the context window. The four diagrams differ only in which tool and which source are highlighted, which is itself the point, the tools are interchangeable mediators between the same sources and the same context window.

```
   +------+   user msg     +-----+   tool call   +---------------------+      +------------------+      +----------------+
   | User | -------------> | LLM | ------------> | Context retrieval   | ---> | Context sources  | ---> | Context window |
   |      | <------------- |     | <------------ | tools               |      | files / db / web |      | (what the LLM  |
   +------+  assistant msg +-----+  tool result  +---------------------+      | / memory         |      |  actually sees)|
                                                                             +------------------+      +----------------+
   tools shown: file-search | skill-loading | database (semantic_search / execute_query) | web-search | memory | shell
```

The diagrams make one subtle, useful claim explicit: **Agent Skills live in the context window as YAML frontmatter (name + description only), and the skill body is loaded as a tool result on demand.** In the "database query tool + skills" diagram, the skill-loading tool fires first, the skill body arrives as a tool result, *then* the database tool fires and its rows arrive as a second tool result. That is progressive disclosure drawn as a data-flow, and it matches how our codifier-skill preseed is supposed to behave.

### Demo 1: Vanilla semantic search (the low-floor, low-ceiling tool)

A LangChain `@tool`-decorated Python function wraps `vector_store.similarity_search(query, k=3)`. The docstring becomes the tool description (deliberately a one-liner, which she flags as breaking her own rule, tolerable only because there is a single tool). It works for "which sessions discuss regulatory constraints" but breaks in two predictable ways: keyword/acronym queries (searching for "JEPA" returns Gemma and unrelated talks because the embedding has no purchase on the rare token), and any query needing a filter or aggregation (top-k is hardcoded to 3, no metadata filters exist). The metadata fields (day, time, room, speaker) are *not* embedded, so semantic search cannot touch them, only filters can. This is the canonical low-floor tool: the agent never writes a bad parameter, but the tool simply cannot express most real queries.

### Demo 2: General-purpose query execution + Agent Skill (raising the floor on a high-ceiling tool)

The semantic tool is replaced with an `execute_esql_query(query)` tool that takes a full ESQL query string (ESQL is Elastic's pipe-based query language, SQL-shaped). She upgrades the model from GPT-nano to GPT-mini because writing a correct query from scratch is harder. Two design moves matter:

1. **Error handling as self-correction.** The tool wraps execution in try/except and *returns the error string to the agent* instead of crashing, so the agent can rewrite the query. She calls this generally essential.
2. **An Agent Skill to fix systematic parameter errors.** The agent writes `%` as a wildcard (SQL habit) when ESQL wants `*`, silently returning zero rows. Rather than patch the prompt with one band-aid per bug ("which is how you end up writing the entire ESQL docs into your system prompt"), she attaches a small skill carrying ESQL syntax rules, loaded on demand, and adds a *relationship* to the tool description: "always use the ESQL skill to generate the query before using this tool", reinforced in the system prompt. After this, the agent writes valid ESQL and can also do aggregations (COUNT of sessions on a date) inside the query.

The aggregation point is independently valuable: **outsourcing the COUNT to the query engine is both more accurate (LLMs count badly) and more context-efficient (27 rows never enter the window)** than retrieving rows and letting the model tally.

### Demo 3: Shell tool over a filesystem + custom semantic-grep CLI

The corpus is re-materialized as one `.txt` file per session under `data/session_data/<type>/`, and the agent gets LangChain's shell tool (Anthropic calls it bash, OpenCode calls it exec). With only `ls`/`grep`/`cat`, GPT-nano is sufficient because models are strong at filesystem navigation. A funny but instructive behavior: asked a semantic query, the agent "cheats at semantic search" by chaining grep over a pile of hand-generated synonyms (regulate, compliance, GDPR, governance, ...). It often works, but it is brittle and inefficient (her counter-example: "find movies with animal superheroes" by grepping every animal name). The fix is a mountable semantic CLI: she installs `jina-grep` and adds a system-prompt block telling the agent it exists, its flags (`--top-k`, `--threshold`, `--granularity`), and a routing rule: **exact substring or known filename → `grep`/`find`/`cat`; natural-language/fuzzy → `jina-grep`.** With that one CLI mounted, the agent answers the semantic query correctly on the first try. She names three peers in this category: `sem-tools` (LlamaIndex), `ColGrep` (LightOn, multi-vector), and `jina-grep` (Jina).

### The synthesis: low floor / high ceiling

```
            low ceiling                         high ceiling
          +------------------------+          +---------------------------+
 low      | specialized tool       |          |   (the goal: a            |
 floor    | e.g. semantic_search,  |          |    crystallised helper)   |
          | get_customer_by_id     |          |                           |
          | - simple params        |          |                           |
          | - agent rarely errs    |          |                           |
          | - one call, cheap model|          |                           |
          +------------------------+          +---------------------------+
 high     |                        |          | general-purpose tool      |
 floor    |                        |          | e.g. shell, execute_query |
          |                        |          | - high ceiling            |
          |                        |          | - more param errors       |
          |                        |          | - more iterations         |
          |                        |          | - needs stronger model    |
          +------------------------+          +---------------------------+
```

Her decision procedure: if you know your agent's query behavior, hand-curate a balanced set (specialized for the hot paths, general-purpose for the long tail). If you do not, start general-purpose, log behavior, and when you see breakage (four to five tool calls per question), carve out a specialized interface for that pattern. The bottom-right-to-top-right arrow, taking a high-ceiling general tool and giving the observed hot path a low floor, is precisely datafetch crystallisation.

## Strengths

- **Names the design space cleanly.** "Low floor / high ceiling" plus the failure taxonomy (no tool / wrong tool / wrong params) is a compact, reusable vocabulary we currently lack a crisp version of. It maps one-to-one onto our interface-mode work and gives us language for write-ups and the eval narrative.
- **Independently validates crystallisation.** The "start general, log, carve specialized" methodology and the three-day OpenClaude self-experiment are arrived at from a pure retrieval-practitioner angle, with no knowledge of our substrate. External convergence on our core loop is strong evidence the thesis is right, useful for the hackathon pitch.
- **Concrete, runnable evidence.** Every claim has a notebook behind it, and the system-prompt files (`system_prompt_db.md`, `system_prompt_fs.md`, `system_prompt_fs_jina_grep.md`) are small, well-structured examples of the schema-description-in-prompt and tool-routing patterns we use in our harness preseed.
- **Actionable tool-description discipline.** Core purpose → trigger conditions (when to use / not use) → relationships (call skill X first, get confirmation) → reinforce in system prompt. This is a checklist we can apply verbatim to `df.d.ts` doc comments and codifier-skill descriptions.
- **Cites a hybrid-wins benchmark.** The Vercel "is bash all you need" result (bash + DB tool beats either alone, DB-then-verify-with-shell) is a citable design precedent for the CRAG eval.

## Limitations & Risks

- **Pedagogical, not production.** The repo is a teaching artifact (LangChain wrappers, toy conference corpus, GPT-nano/mini). There is no benchmark, no leaderboard, no scale data. Nothing here is a dependency to take; the value is entirely conceptual.
- **No skill-context-hygiene answer.** The most relevant audience question, how to *unload* skills from the context window after a long session with ten skills loaded, was answered weakly (she deferred to a colleague, Joe from Elastic, who described on-demand load + offload via a file store + compaction, but offered no concrete mechanism). This is the same context-pressure problem our progressive-disclosure design has to solve, and the workshop does not solve it.
- **Sub-agents and RAG-vs-agentic-RAG routing unanswered.** Two good questions (use sub-agents for search? how to route between cheap fixed RAG and expensive agentic RAG?) got honest "I have not played with that" / "I do not have a good answer" responses. The latter is exactly our latency/cost trade-off question and remains open here too.
- **Elastic framing bias.** The database path is ESQL/Elasticsearch-specific. The transferable content is the *pattern* (general query tool + skill + error-return), not the engine.
- **"Agent cheats at semantic search with grep synonyms" is presented as charming, but it is a real correctness risk** at scale (the animal-superheroes counter-example). For our numeric/financial corpora this synonym-chaining behavior would be a silent-failure source, reinforcing why a mounted semantic CLI or typed interface beats raw grep.

## Integration Analysis

**1. What to extract.**

- **The low-floor / high-ceiling vocabulary** as the framing for our interface modes. Adopt it in the eval write-up and in `kb/docs/intent-shape-interface.md`: the typed `df.d.ts` namespace is the low-floor surface, code-mode `exec` is the high-ceiling surface, and a crystallised `lib/<tenant>/<name>.ts` helper is the deliberate act of lowering the floor on an observed high-ceiling path. This directly reframes the iter3.0a finding ([`project_iter3_0a_finding`] in memory): "interface mode != candidate-only AND preseed prompt is mandate-strength" is, in her terms, *do not ship only the low-floor surface, and use a mandate-strength relationship to force the skill-before-tool ordering.*
- **The failure taxonomy as a diagnostic lens on the CRAG shape-probe defects** ([`17-crag-shape-probe-findings.md`](17-crag-shape-probe-findings.md)). Our "warm call returns Microsoft's PE ratio when the question asked for market cap" is precisely her "wrong parameters" failure mode on a general-purpose tool, the helper froze the tool sequence and the planner supplied a sibling intent. Her remedy (finer signatures + a relationship contract that refuses to fire the tool without the right skill/plan) aligns with the three fixes brief 17 already recommends.
- **The tool-description checklist** for `df.d.ts` doc comments and codifier-skill frontmatter: core purpose, trigger conditions, relationships, prompt reinforcement.
- **Error-return-for-self-correction** as a harness invariant: tool failures should return the error to the agent, not abort the episode. Worth auditing our harness for any path that crashes instead of returning a structured error.
- **Aggregation outsourcing** for the FinQA / BIRD numeric paths ([`06-bird-finqa-corpus.md`](06-bird-finqa-corpus.md)): prefer pushing COUNT/SUM/aggregation into the query/helper rather than returning rows for the model to tally, a correctness and context-efficiency win.
- **Mountable semantic-grep CLIs** (`jina-grep`, `sem-tools`, `ColGrep`) as candidates for the dataset harness shell, the literal realization of our "query mount = temporary worktree over the dataset harness" analogy ([`project_canonical_analogy`] in memory). A semantic-grep binary mounted into the harness gives the high-ceiling shell surface a fuzzy-retrieval capability without an embedded vector store.

**2. Bootstrap path.**

- Minimal first step: add a "Low floor / high ceiling" subsection to the interface-design doc and re-label the existing interface modes with it, then re-read the iter3.0a and brief-17 findings through that lens. No code. (Quick)
- Next: apply the four-part tool-description checklist to the `df.d.ts` doc comments and the codifier-skill description, and add an explicit relationship line ("resolve the plan / load the codifier skill before authoring") in the preseed. This operationalizes the mandate-strength finding. (Short)
- Eval design: when scoping the CRAG run, add a hybrid arm (typed data interface + shell verification pass) mirroring the Vercel "is bash all you need" result, rather than only typed-vs-shell head-to-head. (Short to Medium, eval-harness work)
- Optional probe: mount `jina-grep` (free Jina API key, no registration) into a sandboxed dataset harness over a CRAG mock-web shard and observe whether the agent's tool-call count drops versus raw grep synonym-chaining, a direct test of her low-floor-CLI claim on our corpus. (Medium)

**3. Effort estimate.** Vocabulary adoption + doc reframing: **Quick (< 1h)**. Tool-description checklist + mandate-strength relationship in preseed: **Short (< 4h)**. Hybrid CRAG arm in the eval harness: **Medium (< 1d)**. `jina-grep`-mounted probe: **Medium (< 1d)**.

## Key Takeaways

1. **Adopt "low floor / high ceiling" as the canonical frame for our interface modes, and state crystallisation as "lowering the floor on an observed high-ceiling path."** It is the cleanest external articulation of why we curate interfaces, and it directly re-explains the iter3.0a mandate-strength finding and the brief-17 warm-reuse defect.
2. **Crystallisation is independently validated.** A retrieval practitioner at a search vendor arrived at "start general-purpose, log behavior, carve specialized tools for the hot paths" from first principles, including a self-experiment that mirrors our observe-gate-crystallise loop. Use this as third-party evidence in the hackathon narrative.
3. **The brief-17 wrong-answer bug is her "wrong parameters" failure mode, and her remedies match ours.** Finer signatures plus a mandate-strength skill-before-tool relationship plus return-error-for-self-correction. This converges with the three fixes brief 17 already prescribes; treat it as confirmation, not new direction.
4. **For the CRAG eval, design a hybrid arm, not just a bake-off.** The cited Vercel result (bash + DB beats either alone, query-then-verify) suggests pairing the typed data interface with a shell/semantic-grep verification pass is the stronger configuration, and is itself a measurable hypothesis.

## Sources

- [Agentic Search for Context Engineering, Leonie Monigatti, AI Engineer Europe 2026 (YouTube)](https://www.youtube.com/watch?v=ynJyIKwjonM), the workshop talk; full transcript and the four architecture diagrams are the primary source.
- [`iamleonie/workshop-agentic-search` (GitHub)](https://github.com/iamleonie/workshop-agentic-search), companion repo: three LangChain notebooks, three system-prompt files, four diagrams, conference-schedule corpus.
- `notebooks/system_prompt_db.md`, `system_prompt_fs.md`, `system_prompt_fs_jina_grep.md` (in the repo), concrete schema-in-prompt and tool-routing examples.
- [The shell tool is not a silver bullet for context engineering (Elastic Search Labs)](https://www.elastic.co/search-labs/blog/search-tools-context-engineering), the author's longer-form argument behind the talk.
- [Building effective database retrieval tools for context engineering (Elastic Search Labs)](https://www.elastic.co/search-labs/blog/database-retrieval-tools-context-engineering), the database-tool-design half.
- [Elastic Agent Skills](https://github.com/elastic/agent-skills), production examples of the progressive-disclosure skill pattern shown in Demo 2.
- [`jina-grep` CLI (Jina AI)](https://github.com/jina-ai/jina-grep-cli), mountable semantic-grep CLI used in Demo 3; free API key without registration.
- Vercel "is bash all you need" experiment (referenced verbally in Q&A), hybrid bash + database agent achieving the highest accuracy via query-then-verify; track down the exact post before citing in the CRAG eval plan.
- `sem-tools` (LlamaIndex) and `ColGrep` (LightOn), alternative semantic-grep CLIs named as peers to `jina-grep`.
- Speaker: [@helloiamleonie (X)](https://x.com/helloiamleonie), [LinkedIn](https://www.linkedin.com/in/804250ab/).
- Related internal briefs: [`14-codex-code-mode-strategic-implications.md`](14-codex-code-mode-strategic-implications.md), [`16-substrate-benchmark-scouting.md`](16-substrate-benchmark-scouting.md), [`17-crag-shape-probe-findings.md`](17-crag-shape-probe-findings.md), [`01-voyage-ai-code-mode-data-interface.md`](01-voyage-ai-code-mode-data-interface.md).
