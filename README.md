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

### Find Operations

| Operation | Behavior |
|-----------|----------|
| `findMany()` | Excludes soft-deleted records (where field is `null`) |
| `findFirst()` | Excludes soft-deleted records |
| `findFirstOrThrow()` | Excludes soft-deleted records; throws if none found or only deleted records match |
| `findUnique()` | Returns `null` if the record is soft-deleted |
| `findUniqueOrThrow()` | Throws `P2025` if the record is soft-deleted |

Non-configured models bypass all soft-delete behavior entirely.

## `includeSoftDeleted` Option

Pass `{ includeSoftDeleted: true }` to any find operation to include soft-deleted records:

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
```

The default is `includeSoftDeleted: false`, which filters out soft-deleted records.

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
