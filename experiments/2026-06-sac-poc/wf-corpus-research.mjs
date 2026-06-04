export const meta = {
  name: 'corpus-derivation-research',
  description: 'Deep research to DERIVE the right corpora for the two gated claims (C4 governance-under-staleness, C2 zero-src onboarding) + a deeper C5 serial-depth corpus: enumerate candidates, verify availability/shape/saturation/license live, and produce a ranked, evidence-backed acquisition recommendation.',
  phases: [
    { title: 'Scout', detail: 'multi-modal candidate enumeration per claim + in-env inventory (WebSearch + Bash/HF-Viewer probes)' },
    { title: 'Verify', detail: 'adversarially verify the top candidates load-bearing claims (rows-really-returned, not-saturated, tri-state-real, license)' },
    { title: 'Recommend', detail: 'ranked per-claim corpus recommendation + acquisition plan' },
  ],
};

const REPO = '/Users/jayfarei/src/tries/2026-05-01-hackathon';
const SP = `${REPO}/experiments/2026-06-sac-poc`;

const GROUNDING = `
TASK CONTEXT. Read ${SP}/RESEARCH-STRATEGY.md and ${SP}/KICKOFF.md for the full program. We must DERIVE the right corpus for each gated claim, with LIVE evidence (do not trust the assistant's training memory — verify availability with WebSearch + Bash). Honesty: report what you actually verified vs projected; never fabricate availability or saturation numbers.

WHAT EACH CLAIM NEEDS FROM ITS CORPUS:
- C4 (governance-under-staleness): a corpus with (1) a TRI-STATE / hallucination-penalised grader OR a metric where ABSTAIN beats CONFIDENTLY-WRONG (binary pass/fail CANNOT show governance's value); (2) a REAL correctness signal that is NOT saturated on a frontier model (Sonnet-4.6-class) — i.e. r>0, Arm-1 pass-rate materially below ceiling; (3) ground truth that DRIFTS between crystallise and reuse, or that we can drift-inject. FinChain is DISQUALIFIED (saturated, r~0). The kickoff's candidate is CRAG (Meta KDD Cup 2024, tri-state +1/0/-1). A CRAG-db-slice reportedly lives in a 'crag-harness' git worktree; CRAG-finance SQLite reportedly on-disk in a 'code-harness-evals' worktree (but finance = saturated).
- C2 (zero-src onboarding sufficiency): a brand-new DB-shaped (ROW-NATIVE) corpus the substrate has NEVER seen (NOT SkillCraft = home corpus). It must expose EXECUTABLE TABLE ROWS reachable via df.db + answerEquals exact-match (NOT just text-to-SQL supervision pairs). Must NOT be saturated (r>0 hardness screen: Arm-1 pass-rate < ~85%). The kickoff found: HF Dataset Viewer API reachable (HTTP 200); BIRD mirror (xu3kev/BIRD-SQL-data-train) ships only {db_id,question,evidence,SQL,schema} NOT executable rows (row-level SQLite is BIRD's separate ~33GB GitHub release, not in-env); Spider/wikisql Viewer mirrors 404'd. Find a row-native dataset whose ACTUAL TABLE ROWS are acquirable (ideally via the HF Viewer or src/adapter/huggingfaceMount.ts) at low ETL cost.
- C5 (deep-invocable helper, TURNS) BONUS: the kickoff found SkillCraft pokedex is FAN-OUT-dominated (~2 serial levels, 5 entities batched in one turn), so it is the cheapest-but-WEAKEST C5 test. Identify a genuine SERIAL-DEPENDENCY-DEPTH corpus (>=3 strictly dependent hops where each call needs the prior output, so inline re-derivation costs many TURNS) — e.g. multi-hop KG traversal (FinReflectKG-MultiHop 3-hop), agentic DAG pipelines. Availability + shape.

METHODOLOGY ANCHORS (read for fit): ${REPO}/kb/br/16-post-skillcraft-benchmark-selection.md (benchmark scouting: CRAG primary, tau-3-bench companion, the cost-to-derive-inline Criterion-3, FinReflectKG/FinChain/Spider analysis), ${REPO}/kb/br/19-skill-library-baseline-ladder-and-paired-eval-methodology.md (CRAG tri-state grader, the 5-arm ladder, paired McNemar). ${REPO}/kb/br/17-crag-shape-probe-findings.md (the df.tool.* blockers — why C2/C4 prefer df.db row-access).

TOOLS: use WebSearch / WebFetch to verify live availability, licenses, frontier-model saturation numbers, and dataset shapes (re-confirm anything postdating Jan 2026). Use Bash to (a) inventory in-env data (git worktree list; find SQLite/parquet/json under the repo + sibling worktrees; HF cache), and (b) probe the HF Dataset Viewer with curl for specific datasets (e.g. https://datasets-server.huggingface.co/rows?dataset=<id>&config=<c>&split=train&offset=0&length=2) to confirm REAL table rows are returned. Report exact URLs/paths/HTTP codes you observed.`;

// ---------------------------------------------------------------------------
// PHASE 1 — SCOUT (parallel, multi-modal)
// ---------------------------------------------------------------------------
phase('Scout');

const CAND_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['claim', 'candidates', 'notes'],
  properties: {
    claim: { type: 'string' },
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'shapeFit', 'availability', 'saturationRisk', 'evidence', 'acquisitionCost', 'verdict'],
        properties: {
          name: { type: 'string' },
          shapeFit: { type: 'string', description: 'how well it matches the claim need (tri-state / row-native / serial-depth)' },
          availability: { type: 'string', description: 'in-env? HF Viewer rows? GitHub release? license? — with the exact evidence (URL/path/HTTP)' },
          saturationRisk: { type: 'string', description: 'frontier-model (Sonnet-4.6-class) pass-rate / r>0 evidence or projection' },
          evidence: { type: 'string', description: 'what you actually verified LIVE vs projected from memory' },
          acquisitionCost: { type: 'string', description: 'DOABLE (in-env / Viewer) | BLOCKED-ENVIRONMENTAL (large fetch/ETL) | with effort' },
          verdict: { type: 'string', enum: ['strong', 'viable', 'weak', 'disqualified'] },
        },
      },
    },
    notes: { type: 'string' },
  },
};

const scout = await parallel([
  () => agent(
    `SCOUT C4 governance-under-staleness corpora. Enumerate + assess candidates (CRAG public 2706-Q set, the CRAG-db-slice in the crag-harness worktree, tau-3-bench, FRAMES, others you find). For each: tri-state/hallucination-penalty grader? real r>0 correctness on a frontier model? drift-injectable? in-env/acquirable (verify with WebSearch + Bash/curl)? license? Probe the in-env worktrees for any CRAG data. ${GROUNDING}\n\nReturn the structured candidate object for claim "C4".`,
    { label: 'scout:C4-governance', phase: 'Scout', schema: CAND_SCHEMA },
  ),
  () => agent(
    `SCOUT C2 fresh-DB ROW-NATIVE corpora. The hard requirement: EXECUTABLE TABLE ROWS reachable via df.db + answerEquals, NOT text-to-SQL supervision pairs. Probe the HF Dataset Viewer (curl https://datasets-server.huggingface.co/rows?dataset=...) for concrete candidates that return REAL rows (e.g. row-native HF tabular datasets, WikiTableQuestions, a Spider/BIRD row mirror if one exists, open tabular QA sets). Re-verify the kickoff's findings (BIRD xu3kev = pairs-not-rows; Spider/wikisql 404). Report exact dataset ids + the HTTP code + a 2-row sample shape you observed. Assess saturation (need r>0). ${GROUNDING}\n\nReturn the structured candidate object for claim "C2".`,
    { label: 'scout:C2-row-native', phase: 'Scout', schema: CAND_SCHEMA },
  ),
  () => agent(
    `SCOUT C5 SERIAL-DEPENDENCY-DEPTH corpora (>=3 strictly dependent hops; inline re-derivation costs many TURNS). Candidates: FinReflectKG-MultiHop 3-hop cross-company, multi-hop KG QA, FRAMES multi-hop, agentic DAG pipelines, GAIA-style. For each: genuine serial depth (NOT fan-out)? availability (WebSearch)? does the structure make a one-shot deep helper save TURNS vs serial inline exploration? ${GROUNDING}\n\nReturn the structured candidate object for claim "C5".`,
    { label: 'scout:C5-serial-depth', phase: 'Scout', schema: CAND_SCHEMA },
  ),
  () => agent(
    `IN-ENV DATA INVENTORY. Establish what data is already on disk so candidates can be typed DOABLE vs BLOCKED-ENVIRONMENTAL. Use Bash: \`git worktree list\`; find SQLite/parquet/json/jsonl datasets under ${REPO} and any sibling worktrees (esp. crag-harness, code-harness-evals); look for HF caches (~/.cache/huggingface); inspect any CRAG SQLite found (table names, row counts, a sample). Probe the HF Viewer reachability (curl -sI). Read ${REPO}/src/adapter/huggingfaceMount.ts to confirm the in-env HF acquisition path + its row shape. Report concrete paths, sizes, table schemas, and HTTP codes — facts only.`,
    { label: 'scout:in-env-inventory', phase: 'Scout' },
  ),
]);
const scoutDigest = scout.map((s, i) => `--- SCOUT ${i} ---\n${typeof s === 'string' ? s : JSON.stringify(s, null, 2)}`).join('\n\n');

// ---------------------------------------------------------------------------
// PHASE 2 — VERIFY (parallel adversarial)
// ---------------------------------------------------------------------------
phase('Verify');

const VERIFY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['claim', 'topPick', 'verifiedClaims', 'risks', 'confidence'],
  properties: {
    claim: { type: 'string' },
    topPick: { type: 'string' },
    verifiedClaims: { type: 'array', items: { type: 'string' }, description: 'load-bearing facts you re-confirmed LIVE (with the evidence)' },
    risks: { type: 'array', items: { type: 'string' }, description: 'unverified assumptions / acquisition or saturation risks that remain' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
};

const verify = await parallel([
  () => agent(
    `Adversarially VERIFY the top C4 corpus pick from the scout. Re-confirm LIVE the load-bearing claims: is the tri-state/hallucination grader real + usable; is it genuinely NOT saturated on a Sonnet-4.6-class model (find a published number or argue r>0); is the data actually in-env or cleanly acquirable; license OK for our use. Use WebSearch + Bash. Surface any claim that does NOT hold up.\n\n=== SCOUT FINDINGS ===\n${scoutDigest}\n\n${GROUNDING}\n\nReturn the structured verification for "C4".`,
    { label: 'verify:C4', phase: 'Verify', schema: VERIFY_SCHEMA },
  ),
  () => agent(
    `Adversarially VERIFY the top C2 row-native corpus pick from the scout. The decisive check: does the HF Viewer (or the named in-env path) ACTUALLY return executable TABLE ROWS (not SQL pairs) for this dataset — re-run the curl yourself and paste the row sample + HTTP code. Confirm r>0 (not saturated) and license. Surface any pick that turns out to be supervision-pairs-not-rows.\n\n=== SCOUT FINDINGS ===\n${scoutDigest}\n\n${GROUNDING}\n\nReturn the structured verification for "C2".`,
    { label: 'verify:C2', phase: 'Verify', schema: VERIFY_SCHEMA },
  ),
]);

// ---------------------------------------------------------------------------
// PHASE 3 — RECOMMEND
// ---------------------------------------------------------------------------
phase('Recommend');

const recommendation = await agent(
  `Synthesise a CORPUS DERIVATION RECOMMENDATION (markdown) from the scout + verify phases. For EACH of C4, C2, and C5 (bonus): the single recommended corpus, the runner-up, the DECISIVE evidence (live-verified vs projected), the acquisition plan typed (DOABLE now | needs-fetch/ETL with effort | BLOCKED-ENVIRONMENTAL), the expected r>0 hardness-screen outcome, and the exact next step to stand it up against the existing eval/skillcraft harness (MountAdapter + gold in answerEquals form). Lead with a one-screen decision table: claim -> recommended corpus -> in-env? -> tri-state/row-native/serial-depth fit -> confidence. Be explicit about anything that remains genuinely USER-GATED vs now-derivable. Honesty: separate LIVE-VERIFIED facts from projections; flag every unverified assumption.

=== SCOUT ===
${scoutDigest}

=== VERIFY ===
${JSON.stringify(verify.filter(Boolean), null, 2)}

${GROUNDING}

Output ONLY the markdown recommendation.`,
  { label: 'recommend:synthesize', phase: 'Recommend' },
);

return { scout, verify: verify.filter(Boolean), recommendation };
