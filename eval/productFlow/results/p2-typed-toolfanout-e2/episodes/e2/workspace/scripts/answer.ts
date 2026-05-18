// scripts/answer.ts
const [u2, u3, u4] = await Promise.all([
  df.tool.jsonplaceholder.getUser({ id: 2 }),
  df.tool.jsonplaceholder.getUser({ id: 3 }),
  df.tool.jsonplaceholder.getUser({ id: 4 }),
]);

const users = [u2, u3, u4].map(({ user }) => ({ name: user.name, email: user.email }));

console.log(JSON.stringify(users));
