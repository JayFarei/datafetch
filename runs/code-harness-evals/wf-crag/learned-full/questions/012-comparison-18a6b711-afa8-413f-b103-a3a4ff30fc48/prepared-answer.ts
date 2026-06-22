const answer = df.answer.bind(df);
process.chdir("/Users/jayfarei/src/tries/2026-05-01-hackathon/.claude/worktrees/code-harness-evals/runs/code-harness-evals/wf-crag/learned-full/questions/012-comparison-18a6b711-afa8-413f-b103-a3a4ff30fc48/workspace");

// CRAG finance — comparison question 18a6b711-afa8-413f-b103-a3a4ff30fc48
//
// Question (verbatim):
// which company has a higher dividend yield, ford or pfizer?
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  const [fordResults, pfizerResults] = await Promise.all([
    df.db.records.search("Ford Motor"),
    df.db.records.search("Pfizer"),
  ]);

  const fordTicker = fordResults[0]?.id ?? "F";
  const pfizerTicker = pfizerResults[0]?.id ?? "PFE";

  const [fordInfo, pfizerInfo] = await Promise.all([
    df.tool.cragFinance.get_info({ ticker: fordTicker }),
    df.tool.cragFinance.get_info({ ticker: pfizerTicker }),
  ]);

  const fordYield = fordInfo.dividendYield as number;
  const pfizerYield = pfizerInfo.dividendYield as number;

  const winner = fordYield > pfizerYield ? "Ford" : pfizerYield > fordYield ? "Pfizer" : "tie";

  return df.answer({
    status: "answered",
    value: winner,
    evidence: [
      { reason: `Ford (${fordTicker}) dividend yield: ${fordYield}` },
      { reason: `Pfizer (${pfizerTicker}) dividend yield: ${pfizerYield}` },
    ],
  });
}

return await main();

