// scripts/answer.ts
const result = await df.tool.jsonplaceholder.getUser({ id: 1 });
console.log(JSON.stringify({ name: result.user.name, email: result.user.email }));
