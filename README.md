# @thenkei/prisma-soft-delete-extension

Soft-delete support for Prisma v7+ via client extensions.

This extension turns configured `delete()` / `deleteMany()` calls into timestamp updates, filters soft-deleted rows from the normal Prisma query surface, adds lifecycle helpers for restore and intentional hard delete, and blocks write paths that would otherwise mutate deleted rows silently.

## Installation

```bash
npm install @thenkei/prisma-soft-delete-extension
```

Peer dependencies:
- `@prisma/client >=7.0.0`
- `prisma >=7.0.0`

## Quick Start

Add a nullable `DateTime` field to each soft-deleted model:

```prisma
model User {
  id        Int       @id @default(autoincrement())
  name      String
  deletedAt DateTime?
}
```

Extend your Prisma client:

```ts
import { PrismaClient } from '@prisma/client';
import { createSoftDeleteExtension } from '@thenkei/prisma-soft-delete-extension';

const prisma = new PrismaClient().$extends(
  createSoftDeleteExtension({
    models: {
      User: true,
    },
  })
);
```

Basic lifecycle:

```ts
const user = await prisma.user.create({ data: { name: 'Alice' } });

await prisma.user.delete({ where: { id: user.id } });

const hidden = await prisma.user.findUnique({ where: { id: user.id } });
// hidden === null

await prisma.user.restore({ where: { id: user.id } });

await prisma.user.delete({ where: { id: user.id } });
await prisma.user.hardDelete({ where: { id: user.id } });
```

## Configuration

### `field`

Global soft-delete field name. Defaults to `deletedAt`.

```ts
createSoftDeleteExtension({
  field: 'deletedAt',
  models: { User: true },
});
```

### `models`

Model names must match the Prisma schema exactly.

- `true`: use the global field
- `{ field: 'customField' }`: override the field for one model

```ts
createSoftDeleteExtension({
  models: {
    User: true,
    Post: { field: 'archivedAt' },
    Comment: { field: 'removedAt' },
  },
});
```

Models omitted from `models` are full passthrough.

## Behavior Matrix

### Delete

| Operation | Configured model | Unconfigured model |
|-----------|------------------|--------------------|
| `delete()` | Sets the soft-delete field to the current timestamp | Physical delete |
| `deleteMany()` | Sets the soft-delete field on matching rows | Physical delete |

### Lifecycle

| Operation | Configured model | Unconfigured model |
|-----------|------------------|--------------------|
| `restore()` | Restores one previously deleted row; throws `P2025` if the row is active or missing | Throws configuration error |
| `restoreMany()` | Restores only deleted matching rows; returns `{ count: 0 }` when none match | Throws configuration error |
| `hardDelete()` | Physically deletes one previously deleted row; throws `P2025` if the row is active or missing | Throws configuration error |
| `hardDeleteMany()` | Physically deletes only deleted matching rows; returns `{ count: 0 }` when none match | Throws configuration error |

### Query

| Operation | Configured model behavior |
|-----------|---------------------------|
| `findMany()` | Excludes soft-deleted rows |
| `findFirst()` | Excludes soft-deleted rows |
| `findFirstOrThrow()` | Excludes soft-deleted rows |
| `findUnique()` | Returns `null` for a soft-deleted row |
| `findUniqueOrThrow()` | Throws `P2025` for a soft-deleted row |
| `count()` | Excludes soft-deleted rows |
| `aggregate()` | Excludes soft-deleted rows |
| `groupBy()` | Excludes soft-deleted rows through `where`; `having` stays caller-controlled |

Unconfigured models are passthrough for all query operations.

### Update / Upsert

| Operation | Configured model behavior |
|-----------|---------------------------|
| root `update()` | Active-only by default; explicit `deletedAt` predicates override |
| root `updateMany()` | Active-only by default; explicit `deletedAt` predicates override |
| root `upsert()` | Throws if the target row exists and is soft-deleted |
| nested toMany `update()` | Active-only by default; explicit `deletedAt` predicates override |
| nested toMany `updateMany()` | Active-only by default; explicit `deletedAt` predicates override |
| nested toMany `upsert()` | Throws if the target row exists and is soft-deleted |
| nested toOne `update()` | Throws |
| nested toOne `upsert()` | Throws |

## Nested Read Rules

- Relation filters in `where` are rewritten recursively to exclude soft-deleted configured models.
- `include` and `select` on configured toMany relations automatically add `where: { deletedAt: null }` unless you already supply a `deletedAt` predicate.
- Included or selected configured toOne relations become `null` when the related row is soft-deleted.
- Compound-unique `findUnique()` and `findUniqueOrThrow()` stay soft-delete aware.

## `includeSoftDeleted`

Pass `includeSoftDeleted: true` to these operations:

- `findMany()`
- `findFirst()`
- `findFirstOrThrow()`
- `findUnique()`
- `findUniqueOrThrow()`
- `count()`
- `aggregate()`
- `groupBy()`

Examples:

```ts
const allUsers = await prisma.user.findMany({
  includeSoftDeleted: true,
});

const totalUsers = await prisma.user.count({
  includeSoftDeleted: true,
});

const groupedUsers = await prisma.user.groupBy({
  by: ['name'],
  _count: { _all: true },
  includeSoftDeleted: true,
});
```

When `includeSoftDeleted: true` is set, nested relation filtering is skipped for that operation as well.

This option does not affect lifecycle methods, raw queries, or write hardening.

## Restore and Hard Delete Examples

Restore one row:

```ts
await prisma.user.restore({
  where: { id: 1 },
});
```

Restore many deleted rows:

```ts
await prisma.user.restoreMany({
  where: { name: 'archived-user' },
});
```

Hard-delete one row that has already been soft-deleted:

```ts
await prisma.user.hardDelete({
  where: { id: 1 },
});
```

Hard-delete many deleted rows:

```ts
await prisma.user.hardDeleteMany({
  where: {
    deletedAt: { not: null },
  },
});
```

## Raw Queries 

These APIs are explicit passthrough and receive no soft-delete behavior:

- `$queryRaw`
- `$queryRawUnsafe`
- `$executeRaw`
- `$executeRawUnsafe`

`findRaw` is also unsupported by this package. The extension targets Prisma's relational model query surface, not provider-specific raw document APIs.

## Schema Requirements

Soft-delete fields must be nullable `DateTime` fields with no default:

```prisma
model User {
  id        Int       @id @default(autoincrement())
  name      String
  deletedAt DateTime?
}
```

If a configured model can be returned through a toOne relation that you `include` or `select`, make that relation optional in Prisma so runtime nulling is type-safe:

```prisma
model Comment {
  id       Int    @id @default(autoincrement())
  authorId Int?
  author   User?  @relation(fields: [authorId], references: [id])
}
```

## Prisma Version

This package requires Prisma v7+ and uses `Prisma.defineExtension`.

## Release Process

Versioning and publishing are managed by GitHub Actions and semantic-release.

- Pull requests into `main` run CI.
- Pushes to `main` run CI and then semantic-release.
- Do not manually bump `package.json` versions or hand-edit `CHANGELOG.md` for releases.
- Use conventional commits so semantic-release can determine the correct version bump:
  - `fix:` for patch releases
  - `feat:` for minor releases
  - `BREAKING CHANGE:` or `!` for major releases

Local release verification:

```bash
npm run ci
npm pack
```

See [CHANGELOG.md](./CHANGELOG.md) for release history and [UPGRADE.md](./UPGRADE.md) for `0.x` to `1.0.0` migration notes. The release workflow publishes to npm using `secrets.NPM_TOKEN` and creates the matching GitHub release automatically.

## License

MIT
