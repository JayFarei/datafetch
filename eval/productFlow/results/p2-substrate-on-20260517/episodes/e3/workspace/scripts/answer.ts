// scripts/answer.ts
const fanout = await df.lib.toolFanout({
  intent: "repeated tool fan-out",
  entityValues: [5, 6, 7],
  toolBundle: "jsonplaceholder",
  toolNames: ["getUser"],
  paramName: "id",
} as any);

const rows = (fanout.value as any[]).map((entry: any) => {
  const user = entry.getUser ?? entry.tools?.getUser;
  return { name: user.name, website: user.website };
});

console.log(JSON.stringify(rows));
