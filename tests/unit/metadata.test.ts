import { buildModelMetadata } from '../../src/metadata';

describe('buildModelMetadata', () => {
  it('throws a clear error when the runtime data model is unavailable', () => {
    expect(() => buildModelMetadata({ _engineConfig: { inlineSchema: 'model User { id Int @id }' } })).toThrow(
      'prisma-soft-delete-extension: Prisma runtime data model is unavailable; relation traversal, write guards, and lifecycle helpers cannot be initialized.'
    );
  });

  it('throws a clear error when the inline schema is unavailable', () => {
    expect(() =>
      buildModelMetadata({
        _runtimeDataModel: {
          models: {
            User: {
              fields: [],
            },
          },
        },
      })
    ).toThrow(
      'prisma-soft-delete-extension: Prisma inline schema is unavailable; relation list cardinality and compound unique aliases cannot be derived for nested filtering and lifecycle helpers.'
    );
  });

  it('throws a clear error when relation cardinality cannot be resolved', () => {
    expect(() =>
      buildModelMetadata({
        _runtimeDataModel: {
          models: {
            User: {
              fields: [{ name: 'posts', kind: 'object', type: 'Post' }],
            },
          },
        },
        _engineConfig: {
          inlineSchema: 'model User {\n  id Int @id\n}\nmodel Post {\n  id Int @id\n}',
        },
      })
    ).toThrow(
      'prisma-soft-delete-extension: Unable to resolve relation cardinality for User.posts; nested filtering and write guards cannot be initialized.'
    );
  });
});
