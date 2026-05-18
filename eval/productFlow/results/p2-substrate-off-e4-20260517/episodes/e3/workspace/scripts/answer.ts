// scripts/answer.ts
const [r5, r6, r7] = await Promise.all([
  df.tool.jsonplaceholder.getUser({ id: 5 }),
  df.tool.jsonplaceholder.getUser({ id: 6 }),
  df.tool.jsonplaceholder.getUser({ id: 7 }),
]);

const answer = [r5, r6, r7].map(r => ({ name: r.user.name, website: r.user.website }));

console.log(JSON.stringify(answer));
