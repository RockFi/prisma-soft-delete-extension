## [1.0.2](https://github.com/RockFi/prisma-soft-delete-extension/compare/v1.0.1...v1.0.2) (2026-03-25)


### Bug Fixes

* expand contributing guide ([350e771](https://github.com/RockFi/prisma-soft-delete-extension/commit/350e771fbb1b242d1ba7bad1d76b8261de7d64eb))

## [1.0.1](https://github.com/RockFi/prisma-soft-delete-extension/compare/v1.0.0...v1.0.1) (2026-03-25)


### Bug Fixes

* add contributor guidance ([005a958](https://github.com/RockFi/prisma-soft-delete-extension/commit/005a958c2ec6c7458f06685378c9b53ef10d3bf6))

# 1.0.0 (2026-03-25)


### Bug Fixes

* correct workflow skip conditions ([85852f6](https://github.com/RockFi/prisma-soft-delete-extension/commit/85852f6899b7b53aeb47d3a8951129047c9f2f2c))
* pass npm token to release auth ([d21183e](https://github.com/RockFi/prisma-soft-delete-extension/commit/d21183e2e0e89d3db20f7264653994c75f21c294))
* stabilize prisma extension CI ([0a8decc](https://github.com/RockFi/prisma-soft-delete-extension/commit/0a8decc9733271686990b501f3a2d5b428477b7e))


### Features

* add CI and semantic release publishing ([6349ad2](https://github.com/RockFi/prisma-soft-delete-extension/commit/6349ad290a3810dc72c5126831ab788ffdc1b486))
* add nested soft-delete read filtering ([8eb2461](https://github.com/RockFi/prisma-soft-delete-extension/commit/8eb2461e16b67f389ea97d8c9c2142b92afbda85))
* add nested soft-delete read filtering ([1cab849](https://github.com/RockFi/prisma-soft-delete-extension/commit/1cab84959603c574d09e4496a8162fb5b47c4ef7))
* add safe soft-delete write guards ([#2](https://github.com/RockFi/prisma-soft-delete-extension/issues/2)) ([d11c969](https://github.com/RockFi/prisma-soft-delete-extension/commit/d11c969b198db1f963c19b465eb5ea5443fd3785))
* complete query surface soft-delete filtering ([#4](https://github.com/RockFi/prisma-soft-delete-extension/issues/4)) ([2b81cf0](https://github.com/RockFi/prisma-soft-delete-extension/commit/2b81cf0acaea91b1860da0048783bef0e38d9c78))
* complete soft-delete lifecycle ([#5](https://github.com/RockFi/prisma-soft-delete-extension/issues/5)) ([ec31328](https://github.com/RockFi/prisma-soft-delete-extension/commit/ec31328701f7ee70ef5e51380553b7ec00f2f16a))
* initial implementation of @rockfi/prisma-soft-delete-extension ([d1434e1](https://github.com/RockFi/prisma-soft-delete-extension/commit/d1434e1b3c7b7cec6e05b44d6d21635163f15969))

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
