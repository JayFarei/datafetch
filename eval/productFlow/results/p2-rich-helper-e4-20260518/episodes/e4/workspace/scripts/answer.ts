// scripts/answer.ts
const [usersRes, postsRes] = await Promise.all([
  df.tool.jsonplaceholder.getUsers(),
  df.tool.jsonplaceholder.getPosts(),
]);

const postCountByUser: Record<number, number> = {};
for (const post of postsRes.posts) {
  postCountByUser[post.userId] = (postCountByUser[post.userId] ?? 0) + 1;
}

const result = usersRes.users
  .map((user: { id: number; name: string }) => ({
    name: user.name,
    postCount: postCountByUser[user.id] ?? 0,
  }))
  .sort((a: { name: string; postCount: number }, b: { name: string; postCount: number }) => {
    if (b.postCount !== a.postCount) return b.postCount - a.postCount;
    return a.name.localeCompare(b.name);
  });

console.log(JSON.stringify(result));
