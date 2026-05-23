import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  renderFinchainPrompt,
  writeDfDtsStub,
} from "../src/eval/finchainFullDatafetch.js";
import type { FinChainTemplateInstance } from "../src/eval/finchainRecords.js";

const instance: FinChainTemplateInstance = {
  topic: "accounting_and_financial_reporting/balance_sheets",
  templatePosition: 1,
  templateName: "template_cash_accounts_payable",
  seedIndex: 2,
  question:
    "Mastercard has $18910 in cash and $2463 in accounts payable. Calculate the net cash position of the company after paying off all its accounts payable.",
  solution: "18910 - 2463 = 16447",
  difficulty: "Basic",
  goldFinalValue: 16447,
  goldIntermediateValues: [],
};

const helper = {
  name: "constAnswerDfAnswerBindDf",
  intent: "Net cash position from cash and accounts payable.",
  inputKeys: ["cash", "accountsPayable"],
};

const tmpDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("FinChain code-mode helper surface", () => {
  it("prompts for validated learned helpers with the Result value boundary", () => {
    const prompt = renderFinchainPrompt(instance, "finchain-smoke", [helper]);

    expect(prompt).toContain("validated helper must be used");
    expect(prompt).toContain(
      "(await df.lib.constAnswerDfAnswerBindDf({ cash, accountsPayable })).value",
    );
    expect(prompt).toContain("Use the helper result's `.value`");
    expect(prompt).toContain("return `df.answer({...})`");
    expect(prompt).not.toContain("preseeded helper must be used");
    expect(prompt).not.toContain("NOT `df.answer`");
  });

  it("renders df.lib helper declarations as Result envelopes", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "finchain-surface-"));
    tmpDirs.push(workspace);

    await writeDfDtsStub(workspace, [helper]);

    const dts = await readFile(path.join(workspace, "df.d.ts"), "utf8");
    expect(dts).toContain(
      "constAnswerDfAnswerBindDf: (input: { cash: number; accountsPayable: number }) => Promise<{ value: number }>",
    );
    expect(dts).not.toContain("constAnswerDfAnswerBindDf: (input: { cash: number; accountsPayable: number }) => Promise<number>");
  });
});
