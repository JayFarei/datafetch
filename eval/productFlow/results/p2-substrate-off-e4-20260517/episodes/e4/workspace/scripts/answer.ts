// scripts/answer.ts
const [usersRes, postsRes] = await Promise.all([
  df.tool.jsonplaceholder.getUsers(),
  df.tool.jsonplaceholder.getPosts(),
]);

const postCountByUser = new Map<number, number>();
for (const post of postsRes.posts) {
  postCountByUser.set(post.userId, (postCountByUser.get(post.userId) ?? 0) + 1);
}

const answer = usersRes.users
  .map((user: { id: number; name: string }) => ({
    name: user.name,
    postCount: postCountByUser.get(user.id) ?? 0,
  }))
  .sort((a: { name: string; postCount: number }, b: { name: string; postCount: number }) =>
    b.postCount !== a.postCount ? b.postCount - a.postCount : a.name.localeCompare(b.name)
  );

console.log(JSON.stringify(answer));
