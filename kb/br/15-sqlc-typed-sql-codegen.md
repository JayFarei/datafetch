---
title: "sqlc, Type-Safe Codegen From Annotated SQL, as a SQL Storage Layer for Datafetch"
date: 2026-05-15
mode: deep
sources: 18
status: complete
---

# Executive Summary

`sqlc` reads `.sql` files (DDL plus annotated queries) and emits type-safe code, today Go is stable, TypeScript/Kotlin/Python are in beta, with PostgreSQL/MySQL stable and SQLite beta on the Go track. It is a build-time tool, not a runtime: every query is statically named (`-- name: GetUser :one`), parsed against the schema, and compiled to a typed function. There is no production-grade dynamic-query story, that is the tool's well-known Achilles heel.

For datafetch the fit is **moderate, and conditional**. Datafetch today only adapts MongoDB Atlas and HuggingFace, so the question "can sqlc help with SQL storage" is really "if datafetch grows a SQL mount, does sqlc belong inside it?" The plumbing match is weak, `CollectionHandle` is four generic verbs (`findExact|search|findSimilar|hybrid`) while sqlc emits N named functions, so sqlc would not slot underneath the existing `df.db.<ident>.*` surface without translation. The mental-model match is strong, though, sqlc's "annotated SQL, schema-aware typing, one function per intent" is almost the same shape as datafetch's seed primitives plus learned interfaces in `lib/<tenant>/<name>.ts`. The recommended path is to **borrow the ideas, not the tool**, with the exception of the WASM-plugin protocol, which is the only piece worth lifting wholesale if datafetch ever needs an out-of-process codegen worker. The TypeScript plugin's "early access, expect breaking changes" status as of v0.1.3 (Jan 2024, no SQLite) is the practical blocker that makes a deeper integration unwise this quarter.

If datafetch adds a SQL mount later, the best use of sqlc is narrow: as a **build-time schema-introspection-plus-typed-query generator** that emits `lib/__seed__/sql_<query>.ts` primitives from a `queries.sql` file, with the generic `findExact/search` ops translated separately. That keeps sqlc's strengths (compile-time type safety, schema awareness, IDE navigability) without coupling the agent-visible surface to a single store's conventions.

---

# Overview

`sqlc` is a Go CLI that "compile[s] SQL to type-safe code; catch[es] failures before they happen" (the homepage tagline). It is licensed MIT, lives at [sqlc-dev/sqlc](https://github.com/sqlc-dev/sqlc), has 17.6k GitHub stars and 1.04k forks as of 2026-05-15, and ships an active release cadence with v1.31.1 cut on 2026-04-22. The repo is healthy and current, the most recent commit on `main` is dated 2026-05-14.

The pitch is unusual for a "database tool" in 2026, sqlc is explicitly **not an ORM**. It does not provide a query builder, a fluent API, lazy loading, or relationship management. Instead it asks you to write SQL by hand, annotate each query with a name and a return shape (`:one | :many | :exec | :execrows | :batchexec | :copyfrom`), and then at build time it parses both the DDL and the queries, infers Go (or Python, TS, Kotlin) types from the schema, and emits a typed package. The generated code is what your application imports, you never call sqlc at runtime.

Production adoption is real, the homepage lists Buf, Cerbos, Coder, Riza, ngrok, and Scaleway as sponsors/users. The "How We Went All In on sqlc/pgx" Hacker News post (2021) is the canonical adoption case study. Brandur Leach's 2024 check-in reports running sqlc at ~700 queries across 101 files (~7,800 lines of SQL → 34k lines of generated Go), with a "resounding yes" verdict on the bet.

Language reach beyond Go is uneven:

| Language    | Plugin                   | MySQL  | PostgreSQL | SQLite |
|-------------|--------------------------|--------|------------|--------|
| Go          | (built-in)               | Stable | Stable     | Beta   |
| Kotlin      | sqlc-gen-kotlin          | Beta   | Beta       | N/A    |
| Python      | sqlc-gen-python          | Beta   | Beta       | N/A    |
| TypeScript  | sqlc-gen-typescript      | Beta   | Beta       | N/A    |
| C# (community) | sqlc-gen-csharp       | Stable | Stable     | Stable |

The TypeScript plugin's last release is v0.1.3 from 2024-01-02, four total releases over twenty commits, and the README opens with "Here be dragons! This plugin is still in early access. Expect breaking changes, missing functionality, and sub-optimal output." For a TypeScript-native project like datafetch this is the single most important framing fact.

---

# How It Works

## Conceptual pipeline

The flow from `.sql` files to typed code, in five stages:

```
   schema.sql + queries.sql + sqlc.yaml
                 |
   +-------------v-------------+
   | parse  (per-engine parser)|   pg_query_go (libpg_query) for PostgreSQL,
   +-------------+-------------+   antlr4-go for MySQL & SQLite
                 |
   +-------------v-------------+
   | catalog (schema model)    |   tables, columns, enums, NOT NULL flags
   +-------------+-------------+
                 |
   +-------------v-------------+
   | analyze (per-query)       |   columns -> Go/TS/Python types,
   +-------------+-------------+   plus :one/:many/:exec arity
                 |
   +-------------v-------------+
   | codegen (built-in or WASM)|   emit query.sql.go, models.go, db.go
   +-------------+-------------+
                 |
   +-------------v-------------+
   | (optional) managed db     |   verify against ephemeral hosted PG/MySQL
   +---------------------------+
```

The repo lays this out under `internal/`:

- `internal/engine/postgresql/`, `internal/engine/dolphin/` (MySQL, via the first-party `sqlc-dev/marino` parser), `internal/engine/sqlite/` (ANTLR4-generated from a vendored `.g4` grammar), `internal/engine/clickhouse/` (via the first-party `sqlc-dev/doubleclick` parser): four per-engine parser front ends. PostgreSQL has two interchangeable paths, the default CGo `pg_query_go` bindings to libpg_query, and a WASI/wazero fallback (`wasilibs/go-pgquery`) for Windows and no-CGo builds. ClickHouse is parse-only, it works with `sqlc parse -d clickhouse` but is not an accepted `engine:` value in `sqlc.yaml`, so there is no codegen path today.
- `internal/compiler/`: catalog assembly, query analysis, type inference.
- `internal/codegen/golang/`, `internal/codegen/json/`, `internal/codegen/sdk/`: built-in codegen targets and the SDK shared with WASM plugins.
- `internal/plugin/codegen.pb.go` + `internal/plugin/codegen_grpc.pb.go`: the protobuf wire format every external codegen plugin speaks.
- `internal/cmd/`: the eleven CLI subcommands (see below).
- `internal/endtoend/testdata/`: **382 fixture directories**, each a real schema-plus-queries-plus-expected-output triple, run as golden tests. This is the project's primary quality moat.

## Annotation surface

The query annotation is the only thing developers learn:

```sql
-- name: GetAuthor :one
SELECT * FROM authors WHERE id = $1;

-- name: ListAuthors :many
SELECT * FROM authors ORDER BY name LIMIT $1 OFFSET $2;

-- name: DeleteAuthor :exec
DELETE FROM authors WHERE id = $1;

-- name: UpdateBio :execrows
UPDATE authors SET bio = $1 WHERE birth_year > $2;

-- name: BulkInsert :batchexec
INSERT INTO authors (bio, birth_year) VALUES ($1, $2);

-- name: BulkCopy :copyfrom
INSERT INTO authors (bio, birth_year) VALUES ($1, $2);
```

The full command set is ten verbs, not the six shown above. The four I elided are `:execlastid` (returns `LastInsertId()` after an INSERT), `:execresult` (returns the raw `sql.Result` / `pgconn.CommandTag`), `:batchmany` (pgx batch-of-queries returning rows), and `:batchone` (pgx batch-of-queries returning one row each). Two non-command comment flags also exist: `-- @param <name> <go-type>` to override a parameter's Go type, and `-- @sqlc-vet-disable [rules...]` to skip lint rules for a query.

Generated Go (illustrative):

```go
type Author struct {
    ID         int32
    Name       string         // NOT NULL  -> plain type
    Bio        sql.NullString // nullable  -> Null wrapper
    BirthYear  int32
}

func (q *Queries) GetAuthor(ctx context.Context, id int32) (Author, error)
func (q *Queries) ListAuthors(ctx context.Context, arg ListAuthorsParams) ([]Author, error)
func (q *Queries) DeleteAuthor(ctx context.Context, id int32) error
func (q *Queries) UpdateBio(ctx context.Context, arg UpdateBioParams) (int64, error)
```

Nullability is the cleanest example of schema awareness paying off: a column declared `NOT NULL` becomes `string`, an otherwise-identical nullable column becomes `sql.NullString` (or `*string` with `emit_pointers_for_null_types: true`). The code will not compile if you forget the null check.

## Macros (the dynamic-query escape hatch, such as it is)

Four documented macros, all are static-time string rewrites, none give you a true dynamic query:

| Macro         | What it does                                                              |
|---------------|---------------------------------------------------------------------------|
| `sqlc.arg`    | Names a positional parameter so it gets a typed Go/TS arg.                |
| `sqlc.narg`   | Same, but forces the parameter to be treated as nullable.                 |
| `sqlc.embed`  | Replaces `table.*` with a nested struct field on the generated row.       |
| `sqlc.slice`  | Generates `/*SLICE:name*/` to be substituted at runtime for `IN (...)`.    |

`sqlc.slice` is the only one that bends at runtime, and the docs explicitly state it "can't be used with prepared statements." There is no `sqlc.if`, no `sqlc.optional`, no template language. The community workaround patterns (boolean toggle plus `CASE WHEN`, `sqlc.narg(x) IS NULL OR col = sqlc.narg(x)`) are well-documented but produce verbose param structs and rely on the query planner to short-circuit.

## CLI surface

The Cobra command tree, from `internal/cmd/cmd.go`:

| Command           | Purpose                                                     |
|-------------------|-------------------------------------------------------------|
| `sqlc generate`   | The main verb, parse + analyze + emit.                      |
| `sqlc compile`    | Parse + analyze only, no codegen (CI gate).                 |
| `sqlc vet`        | Run CEL-based lint rules over queries.                      |
| `sqlc verify`     | Send schema + queries to sqlc Cloud, check migration safety.|
| `sqlc diff`       | Show diff between current generated output and what's on disk. |
| `sqlc init`       | Scaffold a `sqlc.yaml`.                                     |
| `sqlc push`       | Push schema/queries to sqlc Cloud with a tag.               |
| `sqlc createdb`   | Spin up an ephemeral hosted DB seeded with your schema.     |
| `sqlc parse`      | Dump the parsed catalog (debug).                            |
| `sqlc version`    | Print version.                                              |
| `check` (alias of compile) | For backward compatibility.                         |

`sqlc Cloud` is the optional managed-database backend. With `database.managed: true` set in `sqlc.yaml`, `generate` spins up an ephemeral PG/MySQL, runs your schema against it, and uses the live database for query analysis (catching things the built-in analyzer cannot type), then caches per-query results locally. `sqlc verify` is the gem of the cloud offering, on every push it diff-checks the new schema against every previously-pushed query and fails the build if any would break, useful as a pre-deploy gate.

## Plugin protocol

sqlc's codegen targets beyond Go all run as plugins under one of two transport modes:

- **Process plugins** (legacy): a stdin/stdout subprocess speaking the `codegen.pb.go` protobuf, `format` is either `protobuf` or `json`.
- **WASM plugins** (current): a `.wasm` blob fetched by URL with SHA-256 verification, executed under `tetratelabs/wazero`. This is how `sqlc-gen-typescript`, `sqlc-gen-kotlin`, and `sqlc-gen-python` ship.

The TypeScript plugin is itself written in TypeScript and bundled to WASM via Shopify's **Javy** toolchain (esbuild → single JS bundle → Javy → `.wasm`). That detail matters for datafetch, it shows that a project can author a sqlc plugin entirely in TypeScript without needing Go expertise. The trade-off is per-plugin maturity, since the official sqlc team is Go-first and the non-Go plugins move slowly.

## Configuration shape

`sqlc.yaml` v2 (abridged), enough to scope an integration:

```yaml
version: '2'
cloud:
  project: "<id>"
sql:
  - engine: postgresql                  # postgresql | mysql | sqlite
    schema: db/migrations
    queries: db/queries
    database:
      managed: true                     # use sqlc Cloud's ephemeral DB
    rules: [sqlc/db-prepare]
    gen:                                # built-in Go codegen
      go:
        package: dbq
        out: internal/dbq
        sql_package: pgx/v5
        emit_json_tags: true
        emit_interface: true
        emit_pointers_for_null_types: true
    codegen:                            # OR external plugins
      - out: src/db
        plugin: ts
        options: {runtime: node, driver: postgres}
plugins:
  - name: ts
    wasm:
      url: https://downloads.sqlc.dev/plugin/sqlc-gen-typescript_0.1.3.wasm
      sha256: 287df8f6cc06...
```

A SQL mount for datafetch would slot in approximately at the `sql:` level, with its own `schema:` + `queries:` directories per mount.

---

# Strengths

- **Real schema awareness, no runtime introspection.** Type inference comes from the DDL, not from sampling. Nullability, integer widths, enum membership, JSON columns, all are typed at codegen time. For datafetch this is the single most interesting capability: the current bootstrap pipeline samples rows to infer types in `<coll>.ts`, sqlc would replace sampling with authoritative parsing for SQL substrates.
- **Compile-time query safety.** Every query is parsed against the schema. If you rename a column in DDL and forget to update a query, `sqlc generate` fails before the change ever reaches CI. Brandur Leach's 2024 review credits sqlc with making "almost eight thousand lines of SQL" tractable: "the tooling remains fast and day-to-day quality of life is outstanding."
- **Production-validated at scale.** ngrok, Buf, Cerbos, Coder, and Scaleway run sqlc in production. Brandur's case study (700 queries / 101 files / 34k generated LOC) is the high-water adoption mark. None of these are weekend projects.
- **The plugin model is genuinely portable.** WASM-via-Javy means a TypeScript developer can author a codegen target without leaving the language. The protobuf surface is small and stable enough that community plugins (C#, Ruby, F#, Java, PHP, Zig, Rust+sqlx) have all converged on it.
- **No runtime tax.** sqlc emits code that uses `database/sql`, `pgx/v5`, `pq`, or `mysql`. There is no sqlc package imported in production, the binary disappears after build. Benchmarks routinely show sqlc-generated code matching hand-written `database/sql` performance and beating GORM by a margin.
- **`sqlc verify` is a uniquely good migration gate.** Pushing a candidate schema and getting "these 12 queries would break" back is a piece of safety that's hard to assemble from other tools without writing it yourself.
- **Fixture-test quality moat.** 382 end-to-end fixture directories under `internal/endtoend/testdata/` (each a schema + queries + expected-output triple) means parser and codegen regressions are caught against a huge corpus. This is the kind of investment that takes years to copy.

# Limitations & Risks

- **No dynamic queries. This is the headline.** Every comparable source, the Hacker News threads (28462162, 41478930, 41494936, 42310969), the Brandur 2024 check-in, the Preslav 2023 case against, the dizzy.zone 2024 deep dive, agrees that the lack of dynamic queries is sqlc's single biggest weakness. For datafetch's "agent composes retrievals" model this is a serious shape mismatch: an agent that wants "list rows where any subset of these five filters matches" cannot ask sqlc to generate one function for that, it must enumerate all 32 combinations or fall back to the `sqlc.narg + CASE` workaround, which produces verbose param structs and ugly SQL.
- **TypeScript plugin maturity.** `sqlc-gen-typescript` is on v0.1.3, last released 2024-01-02, with "expect breaking changes, missing functionality, and sub-optimal output" stated in its README. SQLite support is not implemented for TypeScript. The companion `ci-typescript.yml` workflow in the sqlc core repo is currently gated by `if: false`, the plugin is not exercised on every sqlc release. If datafetch wants TS-native generated code, this is the constraint.
- **Refactoring at scale is search-and-replace.** Unlike an ORM where renaming a column is one change, sqlc requires you to update every query that referenced it. The compiler will fail many of them but Preslav reports cases where sqlc "simply assumed perfectly fine" queries that were not.
- **`sqlc.arg`-decorated SQL is no longer pure SQL.** `SELECT … WHERE id = sqlc.arg(authorId)` is not valid PG, you can't paste it into `psql`. For shops that rely on copy-pasting queries into their database tool this is annoying.
- **The `Queries` namespace flattens.** Every generated method hangs off the same struct, which becomes unwieldy past a few hundred queries. Brandur worked around this with naming conventions but called it out as friction.
- **CRUD-heavy apps suffer most.** When most of your queries are trivial `SELECT * WHERE id = $1` you spend more time writing annotations than gaining safety. sqlc shines for moderately complex query shapes, not for boilerplate CRUD.
- **No relationship management.** sqlc has no equivalent of `belongsTo` / `hasMany`. Joins are written by hand every time, which is the point, but for app teams used to ORMs this is a culture shock.
- **Tight per-engine semantics.** Postgres support is the strongest, MySQL has known gaps (e.g. some CTE shapes), SQLite is beta on Go and not supported on TS at all. Datafetch's "SQL substrate" would need to nail down which engine first.
- **Plugin host doesn't have a stable downstream commitment.** The WASM ABI is sqlc's, and sqlc has reserved the right to revise it. Plugin authors carry the cost of keeping up.
- **Silent fallthrough on unsupported AST nodes.** The codebase uses an `ast.TODO{}` sentinel to stub out node types the engine cannot handle. ClickHouse and MySQL (dolphin) both have many of these. The practical consequence is that some SQL constructs produce wrong or empty codegen rather than a loud error, you only notice when the generated code fails to compile or returns the wrong shape. The PostgreSQL parser has the fewest such stubs; ClickHouse the most, which is why ClickHouse remains parse-only despite the engine existing.
- **Acknowledged-incomplete features on the non-PG engines.** MySQL enums (`internal/codegen/golang/mysql_type.go:99` reads `// TODO: Proper Enum support`), MySQL multi-spec `ALTER` (potentially incorrect handling, `dolphin/convert.go:98`), PostgreSQL `float32` nullable columns (currently typed as `sql.NullFloat64`), and a small bag of similar rough edges live as TODOs in the source. None are showstoppers individually, collectively they show the PG-first development priority.

# Integration Analysis

## Three questions

### 1. What to extract

There are three layers of "ideas worth taking" and one piece worth taking literally:

**Idea layer A, the annotation convention.** `-- name: X :one|:many|:exec` is a remarkably terse way to declare "this SQL is a named primitive that returns shape Y." Datafetch already has the analogous concept (`fn({intent, input, output, body})` and learned-interface frontmatter in `lib/<tenant>/<name>.ts`), but the SQL-comment form is interesting for a hypothetical `db/<mount>/queries/<file>.sql` substrate: an agent could read the annotated `.sql` file and immediately know which named retrievals are available, without leaving the SQL.

**Idea layer B, schema-introspection-driven typing.** Today `publishMount` samples rows and infers types. For a SQL substrate the DDL is the authoritative shape, sampling is wasteful. sqlc's parse-DDL-then-emit-types step is the right shape for a SQL mount adapter, even if datafetch never invokes the sqlc binary itself.

**Idea layer C, separate built-in from plugin codegen.** sqlc's `gen:` (built-in) vs `codegen:` (plugin) split keeps the core small and lets community targets evolve independently. Datafetch's `df.d.ts` generation is conceptually similar (one canonical emitter, with room for future targets like Python or Java workspaces).

**Piece to take literally, the WASM plugin protocol.** If datafetch ever needs out-of-process codegen workers (say, a "compile this trajectory into a third-party language" path), `wazero` plus a protobuf request/response is a battle-tested pattern. The `codegen.proto` file is small, ~100 lines, and the Javy bundling trick lets the plugin be written in TypeScript even though the host is anything.

### 2. Bootstrap path

The minimal integration assumes datafetch grows a SQL mount adapter. The order of operations:

1. **First**, add a `SqlMountAdapter` under `src/adapter/sql/` mirroring `AtlasMountAdapter`. It speaks `pg`/`mysql2`/`better-sqlite3` directly. Capabilities are `{vector: false, lex: true, stream: false, compile: true}`. The `CollectionHandle.findExact/search` ops translate to parameterised SQL on the fly; no sqlc involved yet.
2. **Second**, in the bootstrap pipeline (`src/bootstrap/emit.ts`), special-case the SQL substrate: instead of sampling for type inference, read the schema (information_schema) and emit `<coll>.ts` from the DDL. Still no sqlc.
3. **Third**, the optional sqlc layer: a `queries.sql` file in `db/<mount>/queries/` declares mount-specific named retrievals (`-- name: TopAuthorsByGenre :many`). At publish time, run sqlc (either the Go binary as a subprocess, or, more interestingly, vendor the WASM plugin path) and emit the generated typed functions into `lib/__seed__/sql_<mountId>/<query>.ts`. They appear in `df.d.ts` as seed primitives, the same way today's `lib/__seed__/` primitives do.
4. **Fourth**, optionally: hook `sqlc verify` into a `datafetch verify <mount>` verb so DDL changes get checked against shipped queries.

Steps 1 and 2 are independent of sqlc and worth doing on their own. Step 3 is where sqlc earns its keep, and it only earns its keep on the Go track today. The TypeScript plugin's beta status is the gating risk.

### 3. Effort estimate

- **Steps 1+2 (SQL mount, no sqlc)**: Medium, two to three engineering days.
- **Step 3 (sqlc-generated primitives)**: Medium, two to four days additional, mostly fighting the TypeScript plugin's rough edges. Triple this if SQLite is required, since the TS plugin doesn't support it.
- **Step 4 (verify gate)**: Quick, one day, conditional on having an sqlc Cloud account.
- **Total floor**: ~Medium. Total ceiling if you push through TS-plugin instability: Large.

A pragmatic shortcut is to ship steps 1 and 2 first, get a SQL mount working with hand-written typed retrievals in `<coll>.ts`, and only add sqlc if the per-mount query catalog grows past ~20 named queries and the typing burden becomes painful.

## Where sqlc does NOT fit

The biggest anti-pattern would be trying to put sqlc beneath `CollectionHandle`. That contract is four generic verbs (`findExact|search|findSimilar|hybrid`), with no caller-supplied SQL. To make sqlc serve those verbs you'd have to generate one sqlc query per (collection, op, possible-filter-shape) combination, which combinatorially explodes and defeats the static-typing point. The Atlas mount handles this by having one general-purpose retrieval engine. A SQL mount should follow the same shape: generic ops translate to parameterised SQL at runtime, named queries (the sqlc-generated ones) are a **parallel** surface exposed as `lib/__seed__` primitives, not as collection methods.

The second anti-pattern is using sqlc to handle agent-improvised queries. Agents in datafetch routinely synthesise novel composition shapes (the cold path). sqlc cannot generate code for a query the developer hasn't written ahead of time. There is no path where sqlc becomes a runtime tool for ad-hoc agent SQL.

---

# Key Takeaways

1. **sqlc is a build-time tool, not a runtime layer; the boundary it sits on is "the developer writes named SQL queries ahead of time." That boundary does not match how datafetch agents compose retrievals**, so a wholesale adoption inside the agent-visible surface is the wrong direction. Use it as a parallel seed-primitive generator for a future SQL mount, not as a replacement for `CollectionHandle`.
2. **The TypeScript plugin is the practical blocker.** v0.1.3, January 2024, no SQLite, README warns of "breaking changes, missing functionality, sub-optimal output." Any serious bet on sqlc for datafetch should either go to the Go track (which datafetch is not on) or be staged behind that plugin reaching v1.0.
3. **Borrow three ideas, the SQL annotation convention, schema-DDL-driven type inference, and the WASM plugin protocol via `wazero`+Javy. Skip the rest.** Datafetch's `<coll>.ts` synthesiser plus `df.d.ts` emitter are already most of the way to where sqlc lives, the missing piece is "read the substrate's schema instead of sampling" for stores that have a schema.
4. **`sqlc verify` is the underrated piece.** Even if datafetch never uses sqlc for codegen, the "schema-change-vs-known-queries" diff is a reusable shape, both for SQL mounts and conceptually for the trajectory-vs-mount-version compatibility check the system will eventually need.

---

# Sources

## Primary

- [sqlc-dev/sqlc, GitHub](https://github.com/sqlc-dev/sqlc), the main repo, 17.6k stars, MIT, v1.31.1.
- [sqlc.dev](https://sqlc.dev/), homepage with the headline pitch and the user logos (Buf, Cerbos, Coder, Riza, ngrok, Scaleway).
- [docs.sqlc.dev/en/latest/](https://docs.sqlc.dev/), canonical docs, including [reference/config.html](https://docs.sqlc.dev/en/latest/reference/config.html), [reference/macros.html](https://docs.sqlc.dev/en/latest/reference/macros.html), [reference/language-support.html](https://docs.sqlc.dev/en/latest/reference/language-support.html), [howto/select.html](https://docs.sqlc.dev/en/latest/howto/select.html), [howto/managed-databases.html](https://docs.sqlc.dev/en/latest/howto/managed-databases.html), [howto/verify.html](https://docs.sqlc.dev/en/latest/howto/verify.html).
- [sqlc-dev/sqlc-gen-typescript](https://github.com/sqlc-dev/sqlc-gen-typescript), the official TypeScript codegen plugin (v0.1.3, "early access").
- [Preview: Generate TypeScript from SQL (2023-12)](https://sqlc.dev/posts/2023/12/04/preview-typescript-support-with-sqlc-gen-typescript/), the announcement post that explains the Javy WASM bundling.

## Production case studies

- [How We Went All In on sqlc/pgx for Postgres and Go (HN 28462162, 2021)](https://news.ycombinator.com/item?id=28462162), the canonical "we shipped this" thread.
- [Sqlc: 2024 check-in, Brandur Leach](https://brandur.org/fragments/sqlc-2024), ~700 queries / 101 files / 34k generated LOC, "resounding yes" with caveats.
- [pocketbase/pocketbase discussion #4984](https://github.com/pocketbase/pocketbase/discussions/4984), team sharing real-world experience.

## Critical takes

- [Things to Consider When Going With sqlc, Preslav Rachev (2023)](https://preslav.me/2023/03/07/reasons-against-sqlc/), the strongest written case against.
- [SQLC & dynamic queries, dizzy.zone (2024-07)](https://dizzy.zone/2024/07/03/SQLC-dynamic-queries/), the definitive workaround tour.
- [Hacker News, "Sqlc: Data access simplified" (42310969)](https://news.ycombinator.com/item?id=42310969), 2024 thread with concrete dynamic-query and multi-row-insert pain points.

## Comparisons

- [Comparing database/sql, GORM, sqlx, and sqlc, JetBrains GoLand Blog](https://blog.jetbrains.com/go/2023/04/27/comparing-db-packages/).
- [Comparing the best Go ORMs (2026), Encore Cloud](https://encore.cloud/resources/go-orms).
- [llimllib notes, database libraries (Bill Mill)](https://notes.billmill.org/programming/golang/database_libraries/database_libraries.html).
