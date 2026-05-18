// scripts/answer.ts
const result = await df.lib.userPostSummary({ sortBy: "postCount", sortDir: "desc" });
const rows = result.value as Array<{ name: string; postCount: number }>;
console.log(JSON.stringify(rows));
