# Handoff: Snippet runtime fails to resolve named exports from .ts siblings

**Status:** open, blocks merge of `decouple-substrate-from-skillcraft` and reproduction of any iter164-style SkillCraft run.
**Discovered:** 2026-05-18 during Phase 7 smoke verification of the substrate-decouple branch.
**Severity:** harness-fatal — every live SkillCraft / productFlow episode errors out at snippet import time.
**Owner:** unassigned (please pick up).

---

## The bug in one paragraph

When the SkillCraft eval (or any caller of `DiskSnippetRuntime.run`) invokes
the snippet runtime to evaluate an agent-authored TypeScript snippet, Node's
ESM loader instantiates the wrapped `.mts` file and immediately throws
`SyntaxError: The requested module './datafetch_answer_kit.ts' does not provide an export named 'g'`.
The on-disk `datafetch_answer_kit.ts` does export `g` (verified by `grep` and
by a direct `npx tsx` import in a separate process). The failure is specific
to the in-process `await import(pathToFileURL(file).href + '?seq=N')` path that
`src/snippet/runtime.ts:495` uses to evaluate the wrapped snippet.

---

## Exact error

```
/private/tmp/post-decouple-smoke/episodes/usgs-earthquake-monitor/e1/workspace/scripts/.datafetch-run-33802-1779138632369-1.mts:2
import { g } from "./datafetch_answer_kit.ts";
         ^
SyntaxError: The requested module './datafetch_answer_kit.ts' does not provide an export named 'g'
    at #asyncInstantiate (node:internal/modules/esm/module_job:326:21)
    at async ModuleJob.run (node:internal/modules/esm/module_job:429:5)
    at async onImport.tracePromise.__proto__ (node:internal/modules/esm/loader:642:26)
    at async runSnippet (/Users/jayfarei/src/tries/2026-05-01-hackathon/src/snippet/runtime.ts:495:18)
    at async DiskSnippetRuntime.run (/Users/jayfarei/src/tries/2026-05-01-hackathon/src/snippet/runtime.ts:122:62)
    at async runLiveExperimental (/Users/jayfarei/src/tries/2026-05-01-hackathon/src/eval/skillcraftFullDatafetch.ts:696:17)
```

The named exports change between episodes (`g` here; in the iter164 era the
import would have been `{ g, arr, asArr, num, pickNum, avg, r1, firstVal, text,
rowsOf, writeJson }` and the error would name whichever symbol Node parsed
first). The pattern is: any named export of the answer-kit is "not provided"
according to Node's instantiate phase.

A node-26 deprecation warning fires at the start of every run:

```
(node:33802) [DEP0205] DeprecationWarning: `module.register()` is deprecated.
  Use `module.registerHooks()` instead.
```

That warning comes from tsx 4.21.0's loader registration. Likely related.

---

## Critical: this is NOT caused by the substrate-decouple work

The bug reproduces on `main` (commit `ed2b6b5f3`, pre-refactor) with the same
exact symptom. Reproduction transcript:

```
$ git checkout main
$ DATAFETCH_AGENT=claude pnpm eval:skillcraft -- \
    --skillcraft-dir eval/skillcraft/vendor/skillcraft \
    --families usgs-earthquake-monitor --levels e1 \
    --out-dir /tmp/pre-decouple-smoke --live --model claude-sonnet-4-6 \
    --reasoning low --no-lib-cache
$ cat /tmp/pre-decouple-smoke/episodes/usgs-earthquake-monitor/e1/snippet-stderr.txt
SyntaxError: The requested module './datafetch_answer_kit.ts' does not provide
  an export named 'g'
```

iter164 (May 16 2026) ran clean on this same code with `6/6 pass · 1869 mean
eff-tokens · 34s mean latency` on usgs-earthquake-monitor. Something in the
local environment has drifted in the 2 days since.

`vitest` (the 397/397 we run via `pnpm test`) does NOT exercise the failing
path: tests mostly use small snippets that don't import workspace-local `.ts`
siblings, and the AST-rewriter / answer-kit tests assert on string contents
rather than execute the produced code through `DiskSnippetRuntime.run`. So
the test suite is green and we have no canary for this regression.

---

## Environment

| | |
|---|---|
| Platform | macOS Darwin 24.6.0 (arm64) |
| Node | v26.0.0 |
| pnpm | 10.32.0 |
| tsx (installed) | 4.21.0 |
| tsx (latest on npm) | 4.22.2 (per `npx tsx --version` upgrade nag) |
| Repo branches reproducing | `main` (ed2b6b5f3) AND `decouple-substrate-from-skillcraft` (99a185fa0) |
| Working commit before drift | iter164 (2026-05-16) — node/tsx versions at that time unknown; can be reconstructed from `pnpm-lock.yaml` history if needed |

---

## Asymmetry — what works vs what fails

| Invocation | Result |
|---|---|
| `npx tsx ./test.mts` where the .mts statically imports `./helper.ts` | **works** — `g is function` |
| External `npx tsx /tmp/repro.mts` that does `await import(pathToFileURL(...).href + '?seq=N')` of a sibling .mts | **works** — confirmed via /tmp/repro.mts in this session |
| In-process from `pnpm eval:skillcraft` → `DiskSnippetRuntime.run` → `await import(...)` of the wrapped .mts | **fails** — the named-export error above |

The fail-mode is specific to the cumulative state of the `pnpm tsx
src/eval/skillcraftFullDatafetch.ts` process by the time it reaches
`runSnippet()`. A fresh external `tsx` invocation of the SAME wrap + helper
files succeeds.

This rules out: file contents, file paths, missing exports, syntax errors in
the helper. It strongly suggests: a loader-state issue inside the long-lived
eval process — either tsx's `module.register()` hook stops being applied to
nested dynamic imports after some setup step runs, or some prior import in the
eval poisoned the module-graph cache.

---

## Where in the code

The failing call site:

```ts
// src/snippet/runtime.ts:493-499
let error: Error | undefined;
let returnValue: unknown;
try {
  const mod = (await import(
    `${pathToFileURL(file).href}?seq=${seq}`
  )) as { __df_done?: Promise<unknown> };
  if (mod.__df_done) {
    returnValue = await withTimeout(mod.__df_done, timeoutMs);
```

The `file` is `<workspace>/scripts/.datafetch-run-<pid>-<ts>-<seq>.mts`,
written by `wrapSource()` just above. The wrap content is:

```ts
// Stamped by DiskSnippetRuntime
<leading-imports from agent's answer.ts>           ← includes `import { g } from "./datafetch_answer_kit.ts"`
export const __df_done = (async () => {
  <body from agent's answer.ts>
})();
```

The `datafetch_answer_kit.ts` is written by the SkillCraft eval at
`src/eval/skillcraftFullDatafetch.ts:1779`:

```ts
await fsp.writeFile(
  path.join(input.workspace, "scripts", "datafetch_answer_kit.ts"),
  renderAnswerKitSource(),
);
```

`renderAnswerKitSource()` lives in `src/runtime/answerKit.ts` (post-decouple)
or `src/eval/skillcraftFullDatafetch.ts` (on `main`). Either way the produced
string is byte-identical and on-disk verifiable.

---

## Hypotheses (ordered by plausibility)

### H1 — tsx 4.21's `module.register()` loader doesn't apply to imports nested inside dynamic `import()` calls
The deprecation warning is the smoking gun. Node 26 may have changed when/how
the registered loader is consulted; tsx 4.21 might have a latent bug where the
loader is applied to the OUTER `await import()` (so the .mts is transformed)
but NOT to the static imports the .mts then declares (so `./helper.ts` is
treated as raw text, fails to expose its `export const g`).

**Test:** upgrade tsx (`pnpm add -D tsx@latest`, currently 4.22.2). Re-run
smoke. If 4.22.2 fixes it, this hypothesis confirmed; ship the upgrade.

### H2 — Node 26 changed ESM static-import resolution semantics
Node 26 is recent (Oct 2025-ish?). Maybe it tightened static-import resolution
in a way that no longer routes through registered loaders for transitive deps
of a dynamically-imported module.

**Test:** downgrade Node to whatever was current on 2026-05-16 (probably 24 or
25 via nvm/mise). Re-run smoke against `main`.

### H3 — Some import earlier in the eval poisons the module-graph cache
The eval imports many TypeScript files before reaching `runSnippet()`. One of
those imports might prime Node's loader in a way that the loader hook becomes
a no-op for later imports under specific URL shapes.

**Test:** in `src/snippet/runtime.ts`, replace `await import(...)` with
`spawnProcess('npx', ['tsx', file])` and parse the stdout for the answer
envelope. If that works, H3 confirmed; the fix is to externalise snippet
execution. (Heavier change but architecturally cleaner per the
already-discussed isolated-vm question.)

### H4 — The `?seq=N` cache-busting query disables loader transformation for the URL
`pathToFileURL(file).href + '?seq=99'` produces a URL with a query string. Node
ESM normalises query-stringed URLs differently from bare file URLs. The tsx
loader might only match the bare URL pattern.

**Test:** drop the `?seq=N` suffix and use a unique file path per call
(already the case — file name includes `${pid}-${Date.now()}-${seq}`). If that
fixes it, the cache-buster is the culprit.

### H5 — pnpm shim invokes tsx differently than `npx tsx`
The `pnpm eval:skillcraft` script runs `tsx src/eval/skillcraftFullDatafetch.ts`
via pnpm's script runner. pnpm's invocation path may set up the tsx loader
slightly differently than `npx tsx`.

**Test:** run the eval entrypoint directly via `npx tsx
src/eval/skillcraftFullDatafetch.ts ...` (no pnpm). Compare behaviour.

---

## What's been ruled out

- **File contents:** `datafetch_answer_kit.ts` does have `export const g`. `grep`-verified, and a direct `npx tsx -e "import('./datafetch_answer_kit.ts').then(m => Object.keys(m))"` from the workspace dir lists `g`.
- **My substrate-decouple changes:** identical error on `main` pre-refactor.
- **Compile errors in the agent code:** the failure happens at instantiate time, before any agent code runs. The agent's `scripts/answer.ts` is valid TypeScript per the prior iter164 successful run.
- **Test coverage of the failing path:** `vitest` does not call the path, so 397/397 green tells us nothing about this bug.

---

## Suggested investigation order (~1 hour to root-cause)

1. **Upgrade tsx first (cheapest):** `pnpm add -D tsx@latest` (4.22.2). Rerun
   the smoke. 5 minutes. If it fixes, ship and add a `pnpm-lock.yaml` pin.

2. **If tsx upgrade doesn't help, build the minimal repro:**
   ```bash
   mkdir /tmp/repro-bug && cd /tmp/repro-bug
   cat > helper.ts <<EOF
   export const g = (x: any) => "hello " + x;
   EOF
   cat > runner.ts <<EOF
   import { pathToFileURL } from "node:url";
   import { writeFile } from "node:fs/promises";
   const wrap = "/tmp/repro-bug/.run-1.mts";
   await writeFile(wrap, [
     'import { g } from "./helper.ts";',
     "export const __df_done = (async () => console.log('g is', typeof g))();",
   ].join("\n"));
   const mod: any = await import(pathToFileURL(wrap).href + "?seq=99");
   await mod.__df_done;
   EOF
   cd /tmp/repro-bug && pnpm exec tsx ./runner.ts
   ```
   - If repro fails → confirmed loader bug, test fixes against this.
   - If repro succeeds → the bug needs more of the substrate's state. Bisect by
     stripping the eval down to the minimum that triggers the failure.

3. **Try the fix candidates in order:**
   - **Switch to dynamic import inside the wrap.** Rewrite the leading
     `import { g } from "./datafetch_answer_kit.ts"` to
     `const { g } = await import("./datafetch_answer_kit.ts")` inside the
     IIFE. Dynamic imports go through a fresh resolution pass.
   - **Inline the answer-kit.** Have `wrapSource()` concatenate
     `renderAnswerKitSource()` into the .mts directly so there's no sibling
     import to resolve. Cheapest at runtime, makes the wrap larger.
   - **Externalise execution.** Replace `await import()` with
     `spawn('npx', ['tsx', file])`. The biggest change but eliminates the
     loader-state issue entirely. Adds ~200ms per snippet (process startup).
   - **Use `module.registerHooks()`.** Whatever wires tsx in this project,
     migrate it to the non-deprecated API. May not be in our code at all —
     tsx ships its own loader — so this might just mean upgrading tsx.

4. **Add a vitest canary** for the failing path so this can't regress again
   silently. Suggested location: `tests/snippet-runtime-sibling-ts-import.test.ts`.
   The test should write a minimal .mts + .ts pair, call
   `DiskSnippetRuntime.run` on the .mts, and assert the dynamic import succeeds.

---

## Reference artifacts

- Failing run output: `/tmp/post-decouple-smoke/` (6 episodes, all FAIL with the named-export error)
- Pre-refactor failing run: `/tmp/pre-decouple-smoke/` (1 episode, same error)
- iter164 baseline (when the path still worked): `eval/skillcraft/results/datafetch/goal4-iter164-full126-claude-clean-20260516/`
- Single-episode normalized.jsonl from iter164: same dir, has the per-episode
  numbers (usgs-earthquake-monitor: 6/6 PASS · avg 1869 eff-tokens · avg 34s
  latency)

---

## Done-when

- A single SkillCraft family (recommend `usgs-earthquake-monitor`) runs 6/6
  PASS at effective-tokens within ±20% of iter164's 1869.
- A vitest test exercises the failing path and would catch this if it
  regresses.
- `pnpm-lock.yaml` pins the working tsx + Node combination so this can't drift
  silently again.
- The substrate-decouple branch (`decouple-substrate-from-skillcraft`) merges
  green after the fix lands on `main` (or on the branch itself, then
  fast-forward main).
