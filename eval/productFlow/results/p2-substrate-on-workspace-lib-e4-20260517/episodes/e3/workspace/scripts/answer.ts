// scripts/answer.ts
const [u5, u6, u7] = await Promise.all([
  df.tool.jsonplaceholder.getUser({ id: 5 }),
  df.tool.jsonplaceholder.getUser({ id: 6 }),
  df.tool.jsonplaceholder.getUser({ id: 7 }),
]);

const answer = [u5, u6, u7].map(({ user }) => ({
  name: user.name,
  website: user.website,
}));

console.log(JSON.stringify(answer));
