# Task

Fetch the users whose ids are 5, 6, and 7 from the jsonplaceholder tool bundle and write `scripts/answer.ts` so that running it prints a JSON array with one `{"name": "...", "website": "..."}` object per user, in ascending id order.

# Workspace

Write your solution to `scripts/answer.ts`. The file must be a self-contained TypeScript module that uses `df.*` and ends by printing the answer JSON on stdout. The harness runs your file directly; do not invoke it yourself.

**IMPORTANT — your file MUST use top-level `await`.** Do NOT wrap your work in a fire-and-forget IIFE like `(async () => { ... })();` — the inner awaits will not run inside the harness's snippet runtime.

Skeleton — use top-level statements directly:

```ts
// scripts/answer.ts
const result = await df.tool.jsonplaceholder.getUser({ id: 1 });
// ... compose your answer here ...
console.log(JSON.stringify({ /* your answer */ }));
```

If you prefer naming a function, declare and `await` it at the top level:

```ts
async function main() {
  const result = await df.tool.jsonplaceholder.getUser({ id: 1 });
  console.log(JSON.stringify({ name: result.user.name, email: result.user.email }));
}
await main();
```

# Available tool bundles

Bundle: `jsonplaceholder` (HTTP-backed, JSONPlaceholder REST API)

- `df.tool.jsonplaceholder.getUsers()` -> Promise<{ success, users: Array<User> }>
- `df.tool.jsonplaceholder.getUser({ id: number })` -> Promise<{ success, user: User }>
- `df.tool.jsonplaceholder.getPosts()` -> Promise<{ success, posts: Array<Post> }>
- `df.tool.jsonplaceholder.getPostsByUser({ userId: number })` -> Promise<{ success, posts: Array<Post> }>
- `df.tool.jsonplaceholder.getCommentsByPost({ postId: number })` -> Promise<{ success, comments: Array<Comment> }>

# Available substrate primitives

- `df.tool.<bundle>.<name>(input) -> { success, ...payload }` — call a registered tool.
- `df.lib.<helperName>(input) -> { value, ...meta }` — call a learned/seed helper. Unwrap with `(await df.lib.<helperName>(input)).value`.
- `df.answer(value)` — return the final answer envelope; useful when running inside the substrate runner.

# Learned interfaces — MANDATORY pre-flight check

Prior episodes in this workspace may have crystallised reusable helpers under `$DATAFETCH_HOME/lib/<tenant>/`. Calling one when its intent matches is strictly cheaper than calling raw tool primitives, because the substrate records ONE trajectory step for a `df.lib.*` call regardless of how many internal tool calls it makes.

**Step 1 — BEFORE writing answer.ts, you MUST run this Bash command and read the output:**

```bash
cat "$DATAFETCH_HOME/df.d.ts"
```

It is a TypeScript declaration file listing every callable `df.lib.*` and `df.tool.*` with JSDoc describing intent, input schema, and a usage example.

**Step 2 — decide:**

- If any `df.lib.<name>` entry's JSDoc intent matches your task (e.g. a helper described as `"repeated tool fan-out"` or `"per-entity tool call"` matches a task that fetches multiple entities by id with the same tool), you MUST call THAT helper instead of looping raw tool calls. Look at its JSDoc example for input shape.
- If no `df.lib.<name>` matches, use the tool primitives directly.

**Step 3 — when reusing a `df.lib.<name>` helper, ALWAYS inspect its source first** to learn its exact OUTPUT shape (the manifest only shows `Promise<Result<unknown>>` for the return). The source lives at one of these paths:

```bash
cat "$DATAFETCH_HOME/lib/__seed__/<name>.ts"        # seed helpers shipped with the substrate
cat "$DATAFETCH_HOME/lib/<tenant>/<name>.ts"        # helpers learned from prior episodes
```

Use the literal file path you see, substituting the helper's name (and tenant id, found in df.d.ts's `Tenant:` header comment). Read the function's `async body(input)` to see exactly what shape it returns; the substrate wraps that under the `result.value` field of the Result envelope.

Optional secondary discovery: `pnpm exec datafetch apropos '<intent words>'` and `pnpm exec datafetch man <name>`. But reading `df.d.ts` is the contract.

Do NOT invent helper names. Only call `df.lib.<name>` if you saw `<name>` declared in df.d.ts.
