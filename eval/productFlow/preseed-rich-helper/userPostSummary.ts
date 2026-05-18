// Hand-authored "rich helper" for the productflow-jsonplaceholder tenant.
//
// Encodes the entire jsonplaceholder user-post-summary pipeline (fetch
// users + fetch all posts + bucket by userId + project {name,
// postCount} + sort) inside a single typed callable. This is the
// rich-end of the composition-density × input-clarity experiment that
// tests whether agents reuse helpers when (effort-to-call <
// effort-to-derive).
//
// Compare against the auto-crystallised toolFanout (thin fan-out
// wrapper, Object input). This helper's input shape is fully
// declarative — every field reads off the signature without `cat`ing
// the source — and its body subsumes ~15 lines the agent would
// otherwise write inline.

import { fn } from "file:///Users/jayfarei/src/tries/2026-05-01-hackathon-p2/src/sdk/index.ts";
import * as v from "file:///Users/jayfarei/src/tries/2026-05-01-hackathon-p2/node_modules/.pnpm/valibot@1.3.1_typescript@5.9.3/node_modules/valibot/dist/index.mjs";

declare const df: {
  tool: Record<string, Record<string, (input: Record<string, unknown>) => Promise<unknown>>>;
};

type User = { id: number; name: string };
type Post = { userId: number; id: number };
type Row = { name: string; postCount: number };

type Input = {
  sortBy?: "postCount" | "name";
  sortDir?: "asc" | "desc";
};

export const userPostSummary = fn<Input, Row[]>({
  intent:
    "Summarise every jsonplaceholder user by how many posts they have authored. Fetches users + all posts via two tool calls, buckets posts by userId, projects {name, postCount}, sorts by the requested key (default: postCount desc, ties broken by name asc), and returns the resulting array.",
  examples: [],
  input: v.object({
    sortBy: v.optional(v.union([v.literal("postCount"), v.literal("name")])),
    sortDir: v.optional(v.union([v.literal("asc"), v.literal("desc")])),
  }),
  output: v.array(
    v.object({
      name: v.string(),
      postCount: v.number(),
    }),
  ),
  async body(input) {
    const i = input as Input;
    const sortBy = i.sortBy ?? "postCount";
    const sortDir = i.sortDir ?? "desc";

    const usersRes = (await df.tool.jsonplaceholder.getUsers({})) as {
      success: boolean;
      users: User[];
    };
    const postsRes = (await df.tool.jsonplaceholder.getPosts({})) as {
      success: boolean;
      posts: Post[];
    };

    if (!usersRes.success || !postsRes.success) {
      return [];
    }

    const counts = new Map<number, number>();
    for (const post of postsRes.posts) {
      counts.set(post.userId, (counts.get(post.userId) ?? 0) + 1);
    }

    const rows: Row[] = usersRes.users.map((u) => ({
      name: u.name,
      postCount: counts.get(u.id) ?? 0,
    }));

    rows.sort((a, b) => {
      const primary =
        sortBy === "postCount"
          ? sortDir === "desc"
            ? b.postCount - a.postCount
            : a.postCount - b.postCount
          : sortDir === "desc"
          ? b.name.localeCompare(a.name)
          : a.name.localeCompare(b.name);
      if (primary !== 0) return primary;
      return a.name.localeCompare(b.name);
    });

    return rows;
  },
});
