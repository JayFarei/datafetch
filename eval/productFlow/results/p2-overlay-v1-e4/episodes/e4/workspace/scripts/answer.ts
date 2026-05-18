// scripts/answer.ts
const { users } = await df.tool.jsonplaceholder.getUsers();

const results = await Promise.all(
  users.map(async (user: { id: number; name: string }) => {
    const { posts } = await df.tool.jsonplaceholder.getPostsByUser({ userId: user.id });
    return { name: user.name, postCount: posts.length };
  })
);

results.sort((a, b) => b.postCount - a.postCount || a.name.localeCompare(b.name));

console.log(JSON.stringify(results, null, 2));
