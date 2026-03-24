# @rockfi/prisma-soft-delete-extension

Soft-delete (paranoid) support for Prisma v7+ via client extensions.

Instead of permanently deleting records, this extension marks them as deleted by setting a timestamp field, allowing you to preserve data while hiding it from normal queries.

## Installation

```bash
npm install @rockfi/prisma-soft-delete-extension
```

**Peer dependencies:**
- `@prisma/client >=7.0.0`
- `prisma >=7.0.0`

## Quick Start

Add a nullable `DateTime` field to your Prisma schema:

```prisma
model User {
  id        Int       @id @default(autoincrement())
  name      String
  deletedAt DateTime?
}
```

Extend your Prisma client:

```typescript
import { PrismaClient } from '@prisma/client';
import { createSoftDeleteExtension } from '@rockfi/prisma-soft-delete-extension';

const prisma = new PrismaClient().$extends(
  createSoftDeleteExtension({
    models: {
      User: true,
    },
  })
);

// Now when you delete a user, the deletedAt field is set instead of removing the row
await prisma.user.delete({ where: { id: 1 } });

// findMany automatically excludes soft-deleted records
const activeUsers = await prisma.user.findMany();

// Include deleted records when needed
const allUsers = await prisma.user.findMany({ includeSoftDeleted: true });
```

## Configuration Reference

### `field` (optional)

Global default soft-delete field name. Defaults to `'deletedAt'`.

```typescript
createSoftDeleteExtension({
  field: 'deletedAt', // optional, this is the default
  models: { /* ... */ },
})
```

### `models`

Record mapping model names to configuration. Model names must be **PascalCase** (matching your Prisma schema exactly).

**Value types:**
- `true` — use the global field name
- `{ field: 'customFieldName' }` — use a custom field for this model

```typescript
createSoftDeleteExtension({
  models: {
    User: true,                          // uses 'deletedAt'
    Post: { field: 'archivedAt' },       // uses 'archivedAt'
    Comment: { field: 'removedAt' },     // uses 'removedAt'
    // Tag is omitted → full passthrough (no soft delete behavior)
  },
})
```

## API Behavior

### Delete Operations

| Operation | Configured Model | Unconfigured Model |
|-----------|------------------|--------------------|
| `delete()` | Sets timestamp field instead of removing the row | Physically deletes the record |
| `deleteMany()` | Sets timestamp field on all matching rows | Physically deletes matching records |

### Update Operations

| Operation | Configured Model | Behavior |
|-----------|------------------|----------|
| `updateMany()` | Root or nested toMany | Excludes soft-deleted rows by adding `deletedAt: null` unless you already filter on `deletedAt` |
| nested toOne `update` | Target model configured | Throws to avoid mutating a potentially soft-deleted related record |
| nested toOne `upsert` | Target model configured | Throws to avoid mutating a potentially soft-deleted related record |
| `update()` | Root | Passthrough |
| `upsert()` | Root | Passthrough |
| nested toMany `update` / `upsert` | Target model configured | Passthrough |

### Query Operations

| Operation | Behavior |
|-----------|----------|
| `findMany()` | Excludes soft-deleted records (where field is `null`) |
| `findFirst()` | Excludes soft-deleted records |
| `findFirstOrThrow()` | Excludes soft-deleted records; throws if none found or only deleted records match |
| `findUnique()` | Returns `null` if the record is soft-deleted |
| `findUniqueOrThrow()` | Throws `P2025` if the record is soft-deleted |
| `count()` | Excludes soft-deleted records by default |
| `aggregate()` | Excludes soft-deleted records by default |
| `groupBy()` | Excludes soft-deleted records by default through `where`; `having` remains caller-controlled |

Non-configured models bypass all soft-delete behavior entirely.

### Nested Read Behavior

- Nested relation filters in `where` are rewritten to exclude soft-deleted related records.
- `include` and `select` on configured toMany relations automatically add a `where: { deletedAt: null }` filter unless you already provide a `deletedAt` predicate.
- Included or selected configured toOne relations are returned as `null` when the related record is soft-deleted.
- Deeply nested `include`, `select`, and relation predicates are handled recursively.

## `includeSoftDeleted` Option

Pass `{ includeSoftDeleted: true }` to supported query operations to include soft-deleted records:

```typescript
// Get only active users
const active = await prisma.user.findMany();

// Get all users, including deleted ones
const all = await prisma.user.findMany({ includeSoftDeleted: true });

// findFirst with soft-deleted included
const user = await prisma.user.findFirst({
  where: { email: 'example@test.com' },
  includeSoftDeleted: true,
});

// findUnique with soft-deleted included
const user = await prisma.user.findUnique({
  where: { id: 1 },
  includeSoftDeleted: true,
});

// count including soft-deleted records
const totalUsers = await prisma.user.count({
  includeSoftDeleted: true,
});

// groupBy including soft-deleted records
const groupedUsers = await prisma.user.groupBy({
  by: ['name'],
  _count: { _all: true },
  includeSoftDeleted: true,
});
```

The default is `includeSoftDeleted: false`, which filters out soft-deleted records.

When `includeSoftDeleted: true` is set on a supported query, the extension also skips nested relation filtering for that operation. That means:
- nested toMany `include` / `select` relations are not forced to `deletedAt: null`
- soft-deleted toOne relations are not converted to `null`

This option affects `findMany()`, `findFirst()`, `findFirstOrThrow()`, `findUnique()`, `findUniqueOrThrow()`, `count()`, `aggregate()`, and `groupBy()`. It does not change raw queries, `updateMany()` filtering, passthrough write operations, or nested write guards.

## Raw Queries

Raw query APIs are intentionally out of scope for this package:

- `$queryRaw`
- `$queryRawUnsafe`
- `$executeRaw`
- `$executeRawUnsafe`

They are passthrough and receive no soft-delete filtering. `findRaw` is also unsupported by this package; the extension targets Prisma's normal relational model query surface rather than provider-specific raw document APIs.

## Prisma Schema Requirement

Soft-delete fields must be nullable `DateTime` in your Prisma schema:

```prisma
model User {
  id        Int       @id @default(autoincrement())
  name      String
  deletedAt DateTime?  // nullable, no default value
}
```

When a record is soft-deleted, this field is set to the current timestamp. Active records have `null`.

If a model can be soft-deleted and is returned through a toOne relation that you `include` or `select`, define that relation as optional in your Prisma schema. The extension nulls out soft-deleted toOne relations at runtime, so optional relation types are the safe schema shape.

```prisma
model Comment {
  id       Int    @id @default(autoincrement())
  authorId Int?
  author   User?  @relation(fields: [authorId], references: [id])
}
```

## Prisma v7+

This package requires **Prisma v7 or later** and uses `Prisma.defineExtension`, the modern extension API. It is not compatible with deprecated middleware.

## Roadmap

Planned features:
- `restore()` — set the timestamp field back to `null` for a specific record
- `restoreMany()` — restore multiple soft-deleted records
- Permanent deletion helpers — safely delete records that are already soft-deleted
- Scheduled hard deletes — automatically purge soft-deleted records after a retention period

## License

MIT
