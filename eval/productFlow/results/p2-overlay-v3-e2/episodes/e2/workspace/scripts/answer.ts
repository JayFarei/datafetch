// scripts/answer.ts
const result = await df.lib.per_entity({
  entityIds: [2, 3, 4],
  toolBundle: "jsonplaceholder",
  toolNames: ["getUser"],
  paramName: "id",
});

const entities = (result.value as Array<{ entityId: number | string; getUser?: { user?: { name: string; email: string } } }>);

const answer = entities.map((e) => {
  const user = e.getUser?.user ?? (e as any).tools?.getUser?.user;
  return { name: user.name, email: user.email };
});

console.log(JSON.stringify(answer));
