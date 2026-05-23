// Walk FinChain trajectory + lib artifacts to score R4-R9 against the
// learning-honest rubric. Mirrors eval/skillcraft/scripts/walk-artifacts.ts
// in shape. Produces an artifact-walk.json that score-finchain.ts and
// analyze-results.ts both read.
//
// Scope: a minimal port of the skillcraft walker for FinChain trajectories.
// R6 (convergence), R7 (conditional reuse), R8 (conditional cost-drop),
// R9 (cross-shape transfer) all computed from the per-family
// datafetch-home/<family>/{lib,trajectories}/ tree the runner produces.
//
// FinChain caveat: with the current substrate-policy (observer's gate
// requires db.* → lib.* structure), no helpers crystallise on FinChain's
// pure-computation trajectories. R6-R9 will be 0 or null until the
// composition-density lever lands (PLAN.md § Goal 5). This walker
// produces the structured scorecard either way.

import { createHash } from "node:crypto";
import { promises as fsp } from "node:fs";
import path from "node:path";
import ts from "typescript";

// iter 3.3-aligned formula-fingerprint extractor. Mirrors
// src/observer/authorFromSource.ts formulaFingerprint(): parse the
// trajectory's source, find the df.answer({value: <expr>}) call, find
// pure-literal-arithmetic const declarations to use as promoted-param
// names, replace those names in the value expression with
// alphabetically-sorted positional placeholders, sha-256 the
// whitespace-collapsed result, take the first 16 hex. Same input
// produces same fingerprint as the substrate's author so R6/R7
// clustering matches what the observer crystallised.
function computeFormulaIntentFromSource(source: string): string | null {
  try {
    const sf = ts.createSourceFile("walker-source.ts", source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
    const mainBody = findMainBody(sf);
    if (!mainBody) return null;
    const promoted: string[] = [];
    for (const stmt of mainBody.statements) {
      if (!ts.isVariableStatement(stmt)) continue;
      for (const decl of stmt.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name)) continue;
        if (!decl.initializer) continue;
        if (!isPureLiteralArithmeticWalker(decl.initializer)) continue;
        promoted.push(decl.name.text);
      }
    }
    if (promoted.length === 0) return null;
    const valueText = findAnswerValueExpr(mainBody);
    if (!valueText) return null;
    const sorted = [...promoted].sort();
    const byLength = [...sorted].sort((a, b) => b.length - a.length);
    let normalised = valueText;
    for (const name of byLength) {
      const idx = sorted.indexOf(name);
      normalised = normalised.replace(new RegExp(`\\b${escapeRegExp(name)}\\b`, "g"), `__p${idx}__`);
    }
    normalised = normalised.replace(/\s+/g, " ").trim();
    return `source(${createHash("sha256").update(normalised).digest("hex").slice(0, 16)})`;
  } catch {
    return null;
  }
}

function findMainBody(sf: ts.SourceFile): ts.Block | null {
  const holder: { body: ts.Block | null } = { body: null };
  const visit = (node: ts.Node): void => {
    if (holder.body) return;
    if (ts.isFunctionDeclaration(node) && node.name?.text === "main" && node.body) {
      holder.body = node.body;
      return;
    }
    if (ts.isVariableDeclaration(node) && node.name && ts.isIdentifier(node.name) && node.name.text === "main" && node.initializer) {
      if (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) {
        const b = node.initializer.body;
        if (b && ts.isBlock(b)) holder.body = b;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return holder.body;
}

function isPureLiteralArithmeticWalker(node: ts.Expression): boolean {
  if (ts.isNumericLiteral(node)) return true;
  if (ts.isPrefixUnaryExpression(node) && (node.operator === ts.SyntaxKind.MinusToken || node.operator === ts.SyntaxKind.PlusToken)) {
    return isPureLiteralArithmeticWalker(node.operand);
  }
  if (ts.isParenthesizedExpression(node)) return isPureLiteralArithmeticWalker(node.expression);
  if (ts.isBinaryExpression(node)) {
    const op = node.operatorToken.kind;
    if (
      op !== ts.SyntaxKind.PlusToken &&
      op !== ts.SyntaxKind.MinusToken &&
      op !== ts.SyntaxKind.AsteriskToken &&
      op !== ts.SyntaxKind.SlashToken &&
      op !== ts.SyntaxKind.PercentToken &&
      op !== ts.SyntaxKind.AsteriskAsteriskToken
    ) return false;
    return isPureLiteralArithmeticWalker(node.left) && isPureLiteralArithmeticWalker(node.right);
  }
  return false;
}

function findAnswerValueExpr(body: ts.Block): string | null {
  let out: string | null = null;
  const visit = (node: ts.Node): void => {
    if (out) return;
    if (ts.isCallExpression(node)) {
      const isAnswer =
        (ts.isIdentifier(node.expression) && node.expression.text === "answer") ||
        (ts.isPropertyAccessExpression(node.expression) &&
          ts.isIdentifier(node.expression.expression) &&
          node.expression.expression.text === "df" &&
          node.expression.name.text === "answer");
      if (isAnswer && node.arguments.length > 0 && ts.isObjectLiteralExpression(node.arguments[0]!)) {
        for (const prop of node.arguments[0]!.properties) {
          if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) && prop.name.text === "value") {
            out = prop.initializer.getText();
            return;
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface Args {
  runBase: string;
  out?: string;
}

function parseArgs(argv: string[]): Args {
  let runBase = "";
  let out: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]!;
    if (a === "--run-base") runBase = path.resolve(argv[++i]!);
    else if (a.startsWith("--run-base=")) runBase = path.resolve(a.slice("--run-base=".length));
    else if (a === "--out") out = path.resolve(argv[++i]!);
    else if (a.startsWith("--out=")) out = path.resolve(a.slice("--out=".length));
    else throw new Error(`unknown arg: ${a}`);
  }
  if (!runBase) throw new Error("required: --run-base <eval/finchain/results/datafetch/<label>>");
  return { runBase, out };
}

interface HelperHeader {
  filePath: string;
  family: string;
  helperName: string;
  intentSignature: string | null;
  shapeHash: string | null;
  originTrajectory: string | null;
  quarantined: boolean;
}

interface TrajectoryEntry {
  trajectoryId: string;
  family: string;
  episodeLevel: string | null;
  seedIndex: number | null;
  callPrimitives: string[];
  libCalls: string[];          // names of df.lib.* invocations
  hasDbCall: boolean;
  hasLibCall: boolean;
  intentSignature: string | null;
}

async function readJsonOrNull(filePath: string): Promise<unknown> {
  try {
    return JSON.parse(await fsp.readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function walkLibHelpers(datafetchHomeRoot: string): Promise<HelperHeader[]> {
  const out: HelperHeader[] = [];
  let families: string[] = [];
  try {
    families = (await fsp.readdir(datafetchHomeRoot, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return out;
  }
  for (const family of families) {
    const libRoot = path.join(datafetchHomeRoot, family, "lib");
    let tenants: string[] = [];
    try {
      tenants = (await fsp.readdir(libRoot, { withFileTypes: true }))
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
    } catch {
      continue;
    }
    for (const tenant of tenants) {
      if (tenant === "__seed__") continue;  // substrate-level seed; not a learned helper
      const tenantDir = path.join(libRoot, tenant);
      let files: string[] = [];
      try {
        files = await fsp.readdir(tenantDir);
      } catch {
        continue;
      }
      for (const file of files) {
        if (!file.endsWith(".ts")) continue;
        const filePath = path.join(tenantDir, file);
        const content = await fsp.readFile(filePath, "utf8").catch(() => "");
        // Parse the crystallised-helper header annotations (added by author.ts)
        const intentMatch = /@intent-signature:\s*(.+)/i.exec(content);
        const shapeMatch = /@shape-hash:\s*(.+)/i.exec(content);
        const originMatch = /@origin-trajectory:\s*(.+)/i.exec(content);
        const quarantineMatch = /@quarantined:\s*(true|yes|1)/i.exec(content);
        out.push({
          filePath,
          family,
          helperName: file.slice(0, -3),
          intentSignature: intentMatch?.[1]?.trim() ?? null,
          shapeHash: shapeMatch?.[1]?.trim() ?? null,
          originTrajectory: originMatch?.[1]?.trim() ?? null,
          quarantined: Boolean(quarantineMatch),
        });
      }
    }
  }
  return out;
}

async function walkTrajectories(datafetchHomeRoot: string): Promise<TrajectoryEntry[]> {
  const out: TrajectoryEntry[] = [];
  let families: string[] = [];
  try {
    families = (await fsp.readdir(datafetchHomeRoot, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return out;
  }
  for (const family of families) {
    const trajRoot = path.join(datafetchHomeRoot, family, "trajectories");
    let files: string[] = [];
    try {
      files = await fsp.readdir(trajRoot);
    } catch {
      continue;
    }
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const data = (await readJsonOrNull(path.join(trajRoot, file))) as Record<string, unknown> | null;
      if (!data) continue;
      const calls = (data["calls"] as Array<Record<string, unknown>>) ?? [];
      const callPrimitives: string[] = [];
      const libCalls: string[] = [];
      let hasDbCall = false;
      let hasLibCall = false;
      for (const c of calls) {
        const prim = String(c["primitive"] ?? "");
        if (!prim) continue;
        callPrimitives.push(prim);
        if (prim.startsWith("db.")) hasDbCall = true;
        if (prim.startsWith("lib.")) {
          hasLibCall = true;
          libCalls.push(prim.slice("lib.".length).split(".")[0] ?? "");
        }
      }
      // Compute a per-trajectory intent signature so R6/R7 can cluster
      // pure-compute FinChain trajectories whose shape-level metadata is
      // identical. We re-use the authorFromSource fingerprint logic:
      // hash the agent's df.answer({value: <expr>}) expression text with
      // promoted-param identifiers normalised to positional placeholders.
      // Falls back to data["intentSignature"] if set (legacy) or the
      // family+shape-hash if no sourceText is available.
      const sourceText = (data["sourceText"] as string | undefined) ?? "";
      const computedIntent = sourceText ? computeFormulaIntentFromSource(sourceText) : null;
      const fallbackIntent = (data["intentSignature"] as string | undefined) ?? null;
      out.push({
        trajectoryId: String(data["id"] ?? file.slice(0, -5)),
        family,
        episodeLevel: (data["level"] as string | undefined) ?? null,
        seedIndex: (data["seedIndex"] as number | undefined) ?? null,
        callPrimitives,
        libCalls,
        hasDbCall,
        hasLibCall,
        intentSignature: computedIntent ?? fallbackIntent,
      });
    }
  }
  return out;
}

interface R4R9Result {
  R4: { quarantineRate: number; quarantinedHelpers: number; totalHelpers: number; pass: boolean | null };
  R6: { convergenceRate: number; qualifyingClusters: number; crystallisedClusters: number; pass: boolean | null };
  R7: {
    conditionalReuseRate: number;
    warmEpisodesWithHelper: number;
    warmEpisodesReused: number;
    pass: boolean | null;
  };
  R8: {
    pairedComparisons: number;
    meanRatio: number | null;
    perPairPassFraction: number | null;
    pass: boolean | null;
  };
  R9: {
    crossShapeTransfer: string | null;
    familiesReached: string[];
    pass: boolean | null;
  };
}

function computeR4R9(helpers: HelperHeader[], trajectories: TrajectoryEntry[]): R4R9Result {
  const totalHelpers = helpers.length;
  const quarantined = helpers.filter((h) => h.quarantined).length;
  const quarantineRate = totalHelpers === 0 ? 0 : quarantined / totalHelpers;

  // R6: of families with ≥ 2 qualifying trajectories (substrate-rooted,
  // i.e. with a db.* call), what fraction crystallised at least one
  // helper. Family-level clustering matches the substrate's actual
  // crystallisation contract (one helper per family, per intent) better
  // than per-fingerprint clustering, which can spuriously split when the
  // agent's answer-expression text changes between cold (inline math)
  // and warm (helper call) trajectories.
  const familyClusters = new Map<string, { trajectories: number; crystallised: boolean }>();
  for (const t of trajectories) {
    if (!t.hasDbCall) continue;
    const c = familyClusters.get(t.family) ?? { trajectories: 0, crystallised: false };
    c.trajectories += 1;
    familyClusters.set(t.family, c);
  }
  for (const h of helpers) {
    if (familyClusters.has(h.family)) {
      familyClusters.get(h.family)!.crystallised = true;
    }
  }
  const qualifying = Array.from(familyClusters.values()).filter((c) => c.trajectories >= 2);
  const crystallised = qualifying.filter((c) => c.crystallised).length;
  const convergenceRate = qualifying.length === 0 ? 0 : crystallised / qualifying.length;

  // R7: conditional reuse — episodes where a helper was already
  // crystallised in this family BEFORE the episode ran, what fraction
  // actually called any df.lib.* helper. The "warm" classification is
  // family-level positional: order trajectories by createdAt (trajectoryId
  // embeds a timestamp), and any trajectory whose family has a helper
  // and that comes AFTER the family's earliest helper-eligible trajectory
  // is warm. This matches the substrate's actual visibility contract
  // (helpers crystallise during one episode and become visible to the
  // next) better than per-intentSignature equality, which can spuriously
  // diverge when the warm-agent's answer-expression text differs from
  // the cold-agent's.
  const familiesWithHelpers = new Set(helpers.map((h) => h.family));
  const trajectoriesByFamily = new Map<string, TrajectoryEntry[]>();
  for (const t of trajectories) {
    if (!familiesWithHelpers.has(t.family)) continue;
    const arr = trajectoriesByFamily.get(t.family) ?? [];
    arr.push(t);
    trajectoriesByFamily.set(t.family, arr);
  }
  for (const arr of trajectoriesByFamily.values()) {
    arr.sort((a, b) => a.trajectoryId.localeCompare(b.trajectoryId));
  }
  const warmWithHelper: TrajectoryEntry[] = [];
  for (const [, arr] of trajectoriesByFamily) {
    // The first 2 trajectories per family are cold (idx 0 = author the
    // helper, idx 1 = validate + promote). From idx 2 onward the helper
    // is visible to the agent in df.d.ts + AGENTS.md.
    for (let i = 2; i < arr.length; i += 1) {
      warmWithHelper.push(arr[i]!);
    }
  }
  const warmReused = warmWithHelper.filter((t) => t.hasLibCall);
  const conditionalReuseRate = warmWithHelper.length === 0 ? 0 : warmReused.length / warmWithHelper.length;

  // R8: paired cost-drop is a per-pair comparison the analyzer computes
  // (needs token costs per trajectory). For the minimal walker, surface
  // the structural fields and leave numeric computation to the analyzer
  // when token data is joined in.
  const r8 = { pairedComparisons: 0, meanRatio: null as number | null, perPairPassFraction: null as number | null, pass: null as boolean | null };

  // R9: cross-shape transfer — at least one intentSignature whose
  // crystallised helper was called in ≥ 2 distinct families.
  let crossShapeSig: string | null = null;
  const familiesPerSig = new Map<string, Set<string>>();
  for (const t of trajectories) {
    if (!t.hasLibCall) continue;
    if (!t.intentSignature) continue;
    const set = familiesPerSig.get(t.intentSignature) ?? new Set();
    set.add(t.family);
    familiesPerSig.set(t.intentSignature, set);
  }
  let r9Families: string[] = [];
  for (const [sig, fams] of familiesPerSig) {
    if (fams.size >= 2) {
      crossShapeSig = sig;
      r9Families = Array.from(fams);
      break;
    }
  }

  return {
    R4: {
      quarantineRate,
      quarantinedHelpers: quarantined,
      totalHelpers,
      pass: totalHelpers === 0 ? null : quarantineRate <= 0.03,
    },
    R6: {
      convergenceRate,
      qualifyingClusters: qualifying.length,
      crystallisedClusters: crystallised,
      pass: qualifying.length === 0 ? null : convergenceRate >= 0.80,
    },
    R7: {
      conditionalReuseRate,
      warmEpisodesWithHelper: warmWithHelper.length,
      warmEpisodesReused: warmReused.length,
      pass: warmWithHelper.length === 0 ? null : conditionalReuseRate >= 0.60,
    },
    R8: { ...r8 },
    R9: {
      crossShapeTransfer: crossShapeSig,
      familiesReached: r9Families,
      pass: crossShapeSig === null ? null : r9Families.length >= 2,
    },
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const datafetchHomeRoot = path.join(args.runBase, "datafetch-home");
  const helpers = await walkLibHelpers(datafetchHomeRoot);
  const trajectories = await walkTrajectories(datafetchHomeRoot);
  const r4r9 = computeR4R9(helpers, trajectories);
  const out = {
    generatedAt: new Date().toISOString(),
    runBase: args.runBase,
    datafetchHomeRoot,
    helpers,
    trajectories,
    trajectoryCount: trajectories.length,
    libCallTotal: trajectories.reduce((s, t) => s + t.libCalls.length, 0),
    R4R9: r4r9,
  };
  const outPath = args.out ?? path.join(args.runBase, "artifact-walk.json");
  await fsp.writeFile(outPath, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`[walk-artifacts] wrote ${outPath}`);
  console.log(`[walk-artifacts] helpers=${helpers.length}, trajectories=${trajectories.length}, libCallTotal=${out.libCallTotal}`);
  console.log(`[walk-artifacts] R4 quarantineRate=${r4r9.R4.quarantineRate.toFixed(3)} pass=${r4r9.R4.pass}`);
  console.log(`[walk-artifacts] R6 convergenceRate=${r4r9.R6.convergenceRate.toFixed(3)} (${r4r9.R6.crystallisedClusters}/${r4r9.R6.qualifyingClusters}) pass=${r4r9.R6.pass}`);
  console.log(`[walk-artifacts] R7 conditionalReuse=${r4r9.R7.conditionalReuseRate.toFixed(3)} (${r4r9.R7.warmEpisodesReused}/${r4r9.R7.warmEpisodesWithHelper}) pass=${r4r9.R7.pass}`);
  console.log(`[walk-artifacts] R9 crossShape=${r4r9.R9.crossShapeTransfer ?? "(none)"} families=${r4r9.R9.familiesReached.length} pass=${r4r9.R9.pass}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
