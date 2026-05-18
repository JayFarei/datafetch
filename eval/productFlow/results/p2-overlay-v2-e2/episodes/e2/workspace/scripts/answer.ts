// scripts/answer.ts
const result = await df.lib.per_entity({
  entityIds: [2, 3, 4],
  toolBundle: "jsonplaceholder",
  toolNames: ["getUser"],
  paramName: "id",
});

const rows = (result.value as Array<{ entityId: number; getUser: { success: boolean; user: { name: string; email: string } } }>)
  .sort((a, b) => a.entityId - b.entityId)
  .map((r) => ({ name: r.getUser.user.name, email: r.getUser.user.email }));

console.log(JSON.stringify(rows));
