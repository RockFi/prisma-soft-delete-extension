# Upgrading to 1.0.0

## Breaking Behavior Changes

- Root `update()` is no longer passthrough for configured models. It now targets active rows only by default.
- Root `upsert()` now throws if the target row exists and is soft-deleted.
- Nested toMany `update()` is no longer passthrough for configured models. It now targets active rows only by default.
- Nested toMany `upsert()` now throws if the target row exists and is soft-deleted.

If you intentionally target deleted rows in `update()` or `updateMany()`, add an explicit `deletedAt` predicate to the `where` clause.

## New Lifecycle Helpers

Configured models now expose:

- `restore()`
- `restoreMany()`
- `hardDelete()`
- `hardDeleteMany()`

Use `restore()` when a deleted row should become visible again. Use `hardDelete()` only when you intend to remove an already soft-deleted row permanently.

## Query Surface

`count()`, `aggregate()`, and `groupBy()` are now soft-delete aware by default and support `includeSoftDeleted: true`, matching the rest of the supported read/query surface.

## Raw Queries

Raw query APIs remain passthrough in `1.0.0`. If you use `$queryRaw` or `$executeRaw`, you must apply your own soft-delete predicates.
