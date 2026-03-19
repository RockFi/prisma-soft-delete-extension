import { resolveConfig } from '../../src/config';

describe('resolveConfig', () => {
  it('defaults field to deletedAt when omitted', () => {
    const result = resolveConfig({ models: { User: true } });
    expect(result.get('User')).toEqual({ field: 'deletedAt' });
  });

  it('uses global field when specified', () => {
    const result = resolveConfig({ field: 'removed_at', models: { User: true } });
    expect(result.get('User')).toEqual({ field: 'removed_at' });
  });

  it('per-model field override wins over global', () => {
    const result = resolveConfig({
      field: 'removed_at',
      models: { Post: { field: 'deleted_at' } },
    });
    expect(result.get('Post')).toEqual({ field: 'deleted_at' });
  });

  it('empty models produces empty map', () => {
    const result = resolveConfig({ models: {} });
    expect(result.size).toBe(0);
  });

  it('true entry resolves to global field', () => {
    const result = resolveConfig({ field: 'archivedAt', models: { Comment: true } });
    expect(result.get('Comment')).toEqual({ field: 'archivedAt' });
  });
});
