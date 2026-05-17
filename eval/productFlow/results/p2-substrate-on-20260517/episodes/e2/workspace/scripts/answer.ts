// scripts/answer.ts
const result = await df.lib.per_entity({
  entityIds: [2, 3, 4],
  toolBundle: "jsonplaceholder",
  toolNames: ["getUser"],
  paramName: "id",
});

const rows = result.value as Array<{
  entityId: number;
  tools: { getUser: { user: { name: string; email: string } } };
}>;

const answer = rows.map((r) => ({
  name: r.tools.getUser.user.name,
  email: r.tools.getUser.user.email,
}));

console.log(JSON.stringify(answer));
