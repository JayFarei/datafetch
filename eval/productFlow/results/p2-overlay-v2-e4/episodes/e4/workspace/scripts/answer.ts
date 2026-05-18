// scripts/answer.ts
const [usersResult, postsResult] = await Promise.all([
  df.tool.jsonplaceholder.getUsers(),
  df.tool.jsonplaceholder.getPosts(),
]);

const postCountByUserId = new Map<number, number>();
for (const post of postsResult.posts) {
  postCountByUserId.set(post.userId, (postCountByUserId.get(post.userId) ?? 0) + 1);
}

const answer = usersResult.users
  .map((user: { id: number; name: string }) => ({
    name: user.name,
    postCount: postCountByUserId.get(user.id) ?? 0,
  }))
  .sort((a: { name: string; postCount: number }, b: { name: string; postCount: number }) => {
    if (b.postCount !== a.postCount) return b.postCount - a.postCount;
    return a.name.localeCompare(b.name);
  });

console.log(JSON.stringify(answer));
