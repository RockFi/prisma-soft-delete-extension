import { createSoftDeleteExtension } from '../../src/index';

// Behavioral tests for delete, findMany, findUnique, findUniqueOrThrow, and
// includeSoftDeleted are covered comprehensively in tests/integration/.
// Mocking Prisma's $extends proxy system for unit tests would be fragile and
// would duplicate what the integration tests already verify against a real DB.
describe('createSoftDeleteExtension', () => {
  it('returns a Prisma extension (defineExtension result)', () => {
    const ext = createSoftDeleteExtension({ models: { User: true } });
    // Prisma.defineExtension returns an object with a specific shape
    expect(ext).toBeDefined();
    expect(typeof ext).toBe('function'); // defineExtension callback
  });

  it('accepts config with per-model field override', () => {
    expect(() =>
      createSoftDeleteExtension({
        field: 'removedAt',
        models: {
          User: true,
          Post: { field: 'deleted_at' },
        },
      })
    ).not.toThrow();
  });

  it('accepts empty models config', () => {
    expect(() => createSoftDeleteExtension({ models: {} })).not.toThrow();
  });
});
