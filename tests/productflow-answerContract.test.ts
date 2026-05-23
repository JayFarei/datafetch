import { describe, expect, it } from "vitest";

import {
  answersEqual,
  parseAnswerFromStdout,
  selectAnswerValue,
  unwrapFireAndForgetIife,
} from "../src/eval/productFlow/answerContract.js";

describe("productFlow answer contract helpers", () => {
  it("unwraps fire-and-forget async IIFEs into top-level awaited bodies", () => {
    const source = `
void (async () => {
  const result = await df.tool.jsonplaceholder.getUser({ id: 1 });
  console.log(JSON.stringify(result));
})().catch(console.error);
`;

    expect(unwrapFireAndForgetIife(source)).toBe(
      "const result = await df.tool.jsonplaceholder.getUser({ id: 1 });\n" +
        "console.log(JSON.stringify(result));\n",
    );
  });

  it("keeps non-IIFE source untouched", () => {
    const source = "const result = await df.tool.jsonplaceholder.getUsers();\nreturn df.answer(result);\n";
    expect(unwrapFireAndForgetIife(source)).toBe(source);
  });

  it("selects the last JSON stdout line before falling back to df.answer value", () => {
    expect(
      selectAnswerValue({
        stdout: "debug\n{\"from\":\"stdout\"}\n",
        answerEnvelope: { value: { from: "envelope" } },
      }),
    ).toEqual({ from: "stdout" });

    expect(
      selectAnswerValue({
        stdout: "debug only\n",
        answerEnvelope: { status: "answered", value: { from: "envelope" } },
      }),
    ).toEqual({ from: "envelope" });
  });

  it("parses array answers from legacy stdout", () => {
    expect(parseAnswerFromStdout("ignored\n[{\"id\":2},{\"id\":1}]\n")).toEqual([
      { id: 2 },
      { id: 1 },
    ]);
  });

  it("canonicalises object key order and id-keyed arrays for comparison", () => {
    expect(
      answersEqual(
        [{ id: 2, value: { b: 2, a: 1 } }, { id: 1, value: { z: 0 } }],
        [{ id: 1, value: { z: 0 } }, { id: 2, value: { a: 1, b: 2 } }],
      ),
    ).toBe(true);

    expect(answersEqual([{ name: "b" }, { name: "a" }], [{ name: "a" }, { name: "b" }])).toBe(false);
  });
});
