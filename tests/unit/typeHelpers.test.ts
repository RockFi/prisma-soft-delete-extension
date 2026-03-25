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
});
