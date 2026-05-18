// scripts/answer.ts
async function main() {
  const [r2, r3, r4] = await Promise.all([
    df.tool.jsonplaceholder.getUser({ id: 2 }),
    df.tool.jsonplaceholder.getUser({ id: 3 }),
    df.tool.jsonplaceholder.getUser({ id: 4 }),
  ]);

  const answer = [r2.user, r3.user, r4.user].map((u) => ({
    name: u.name,
    email: u.email,
  }));

  console.log(JSON.stringify(answer));
}

await main();
