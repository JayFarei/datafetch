// scripts/answer.ts
const result = await df.lib.per_entity({
  entityIds: [5, 6, 7],
  toolBundle: "jsonplaceholder",
  toolNames: ["getUser"],
  paramName: "id",
});

const rows = (result.value as Array<{ entityId: number; getUser: { success: boolean; user: { name: string; website: string } } }>)
  .sort((a, b) => a.entityId - b.entityId)
  .map((row) => ({ name: row.getUser.user.name, website: row.getUser.user.website }));

console.log(JSON.stringify(rows));
