# Changelog

## 1.0.0

- Added lifecycle helpers on configured models: `restore()`, `restoreMany()`, `hardDelete()`, and `hardDeleteMany()`.
- Hardened root and nested write paths so deleted rows are no longer mutated silently by default.
- Completed soft-delete filtering across Prisma's normal query surface, including `count()`, `aggregate()`, and `groupBy()`.
- Centralized metadata handling and improved initialization errors when Prisma runtime metadata is unavailable.
- Finalized the public behavior contract and added `0.x` to `1.0.0` upgrade notes.

## 0.2.0

- Added integration coverage for both Prisma generators: `prisma-client-js` and `prisma-client`.
- Added nested soft-delete filtering for read paths across relation `where`, `include`, and `select`.
- Added safe write-path guards for `updateMany()` and nested toOne `update` / `upsert`.
- Documented the `v0.2` write contract, including the intentional passthrough behavior of root `update()` / `upsert()` and nested toMany `update` / `upsert()`.
