// scripts/answer.ts
const [r2, r3, r4] = await Promise.all([
  df.tool.jsonplaceholder.getUser({ id: 2 }),
  df.tool.jsonplaceholder.getUser({ id: 3 }),
  df.tool.jsonplaceholder.getUser({ id: 4 }),
]);

const answer = [r2, r3, r4].map(r => ({ name: r.user.name, email: r.user.email }));

console.log(JSON.stringify(answer));
