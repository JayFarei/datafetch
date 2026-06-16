# Onboarding a dataset onto datafetch (zero src/ changes)

> Third-party onboarding guide. After Phase 2 the substrate is dataset-neutral:
> a new dataset compiles into a mountable, learnable code-mode interface using
> ONLY public APIs, with NO changes to `src/` outside `src/eval`. This guide is
> grounded in the integration test `tests/sac-zero-src-onboarding.test.ts`
> (which proves the mechanism end to end) and the existing `productFlow` /
> SkillCraft / FinChain evals. Date: 2026-06-03.

## What "onboarding" means

datafetch compiles a dataset into a typed `df.d.ts` the agent writes code
against, exactly like the existing evals. Onboarding a NEW dataset means:
register a mount (its collections, and optionally its native tools) and
regenerate the manifest. The substrate names no dataset, so this is all you
write, and none of it lives in the substrate.

## The four public steps

All of these are public exports; none requires editing `src/` outside your new
`src/eval/<dataset>/` (or `eval/<dataset>/`) module.

1. **Build the collection idents** — `buildIdentMap(names)` from
   `src/bootstrap/idents.ts` turns your substrate collection names into the
   `{ ident, name }[]` the runtime uses for `df.db.<ident>`.
2. **Build + publish the mount** — construct a `MountAdapter` over your data and
   `publishMount({ source: emitMount(...), id })` (or `makeMountRuntime(...)`
   for an in-process mount). A mount may carry an optional
   `tools?: ToolCatalogEntry[]` (`src/runtime/toolCatalog.ts`) to expose
   `df.tool.<bundle>.<name>` (Phase-2 #4).
3. **Register it** — `getMountRuntimeRegistry().register(mountId, runtime)`.
4. **Regenerate the manifest** — `regenerateManifest({ baseDir, tenantId })`
   writes `<baseDir>/df.d.ts` reflecting the registered mounts.

## What the substrate generates (the reference shape)

`regenerateManifest` emits, with no dataset-specific code:

```ts
declare const df: {
  db: { <ident>: CollectionHandle; ... };          // from the mount's identMap
  tool: { <bundle>: {                               // from the mount's tools (#4)
    [name: string]: (input: any) => Promise<unknown>;
    <toolName>(input: Record<string, unknown>): Promise<unknown>;  // + JSDoc
  }; ... };                                         // omitted entirely if no tools
  lib: { /* learned interfaces + seed primitives, ranked by maturity */ };
  answer(input: AnswerInput): AnswerEnvelope;
  run<T>(fn: () => Promise<T>): Promise<Result<T>>;
};
// + support types: Result<T>, CollectionHandle, AnswerInput, ...
```

This matches the `productFlow` reference shape (db + tool + lib + answer + run).

## Learning + governance (dataset-neutral, Phases 1-2)

Once mounted, the observer crystallises reusable helpers from agent
trajectories into `df.lib.*`, and the quarantine gate validates a candidate by
replaying it against a held-out sibling using the **answer-kit equality
predicate** (`src/runtime/answerKit.ts`): numeric (relative FAC tolerance),
boolean (strict), string (normalised), and structured (canonical deep-eq). A
helper that reproduces the gold is promoted to `validated-typescript` maturity
and becomes callable; one that drifts is declined. This works for non-numeric
answers too (proven by `tests/sac-nonnumeric-maturity.test.ts`).

If your dataset has a bespoke code-gen shape (as FinChain's range-table-math
does), register a `CodegenSpecialization`
(`src/observer/specializationRegistry.ts`) from your eval module; the substrate
dispatches to it generically (see `src/eval/finchainSpecialization.ts`). You do
not edit the author.

## What this guide does NOT cover (needs the dataset + a run)

- **Choosing the benchmark corpus** (e.g. WideSearch vs an alternative) and
  whether it needs callable `df.tool.*` vs db rows + its row-equality
  semantics. This is a research-design decision.
- **The live "helpers learned in hooks-draft" proof**, which needs the corpus's
  data + tasks and an agent run (`DATAFETCH_AGENT=claude`). The onboarding
  MECHANISM above is verified offline; the learning happens during episodes.

## Verify your onboarding

- `git diff --stat src/ ':!src/eval'` shows nothing → zero substrate changes.
- Your generated `df.d.ts` carries `df.db.<your collections>`,
  `df.tool.<your bundles>` (if any), `df.lib`, `df.answer`, `df.run`.
- `pnpm typecheck` + `pnpm test` stay green.
