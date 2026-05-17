// scripts/answer.ts
const result = await df.tool.jsonplaceholder.getUser({ id: 1 });
const user = (result as { user: { name: string; email: string } }).user;
console.log(JSON.stringify({ name: user.name, email: user.email }));
