# Changelog

## 0.2.0

- Added integration coverage for both Prisma generators: `prisma-client-js` and `prisma-client`.
- Added nested soft-delete filtering for read paths across relation `where`, `include`, and `select`.
- Added safe write-path guards for `updateMany()` and nested toOne `update` / `upsert`.
- Documented the `v0.2` write contract, including the intentional passthrough behavior of root `update()` / `upsert()` and nested toMany `update` / `upsert()`.
