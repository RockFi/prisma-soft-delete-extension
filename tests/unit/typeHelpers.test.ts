import { withSoftDeleteTypes } from '../../src/typeHelpers';

describe('withSoftDeleteTypes', () => {
  it('returns the original client instance at runtime', () => {
    const client = {
      user: {
        findMany: () => Promise.resolve([]),
      },
    };

    expect(withSoftDeleteTypes(client)).toBe(client);
  });

  it('returns the original client instance when config is provided', () => {
    const client = {
      user: {
        findMany: () => Promise.resolve([]),
      },
      tag: {
        findMany: () => Promise.resolve([]),
      },
    };
    const config = {
      models: {
        User: true,
      },
    } as const;

    expect(withSoftDeleteTypes(client, config)).toBe(client);
  });
});
