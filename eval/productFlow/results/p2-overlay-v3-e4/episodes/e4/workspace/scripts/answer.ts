// scripts/answer.ts
const usersResult = await df.tool.jsonplaceholder.getUsers();
const users = usersResult.users as Array<{ id: number; name: string }>;

const userIds = users.map((u) => u.id);

const fanout = await df.lib.per_entity({
  entityIds: userIds,
  toolBundle: "jsonplaceholder",
  toolNames: ["getPostsByUser"],
  paramName: "userId",
});

const perEntity = (fanout as any).value as Array<{
  entityId: number;
  getPostsByUser?: { posts?: unknown[] };
  tools?: { getPostsByUser?: { posts?: unknown[] } };
}>;

const answer = perEntity
  .map((item) => {
    const user = users.find((u) => u.id === item.entityId)!;
    const posts =
      item.getPostsByUser?.posts ??
      item.tools?.getPostsByUser?.posts ??
      [];
    return { name: user.name, postCount: posts.length };
  })
  .sort((a, b) =>
    b.postCount !== a.postCount
      ? b.postCount - a.postCount
      : a.name.localeCompare(b.name)
  );

console.log(JSON.stringify(answer));
