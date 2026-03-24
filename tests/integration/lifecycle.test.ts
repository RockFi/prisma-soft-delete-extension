import {
  createRawClient,
  createTestClient,
  integrationProviders,
  resetDatabase,
  type IntegrationProvider,
} from './harness';

describe.each(integrationProviders)('soft delete: lifecycle helpers (%s)', (provider: IntegrationProvider) => {
  let client: any;
  let raw: any;

  beforeAll(() => {
    raw = createRawClient(provider);
  });

  afterAll(async () => {
    await raw?.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase(raw);
    client = createTestClient(provider);
  });

  afterEach(async () => {
    await client?.$disconnect();
  });

  it('restore makes a soft-deleted row visible again', async () => {
    const user = await raw.user.create({ data: { name: 'Alice' } });
    await client.user.delete({ where: { id: user.id } });

    const restored = await client.user.restore({
      where: { id: user.id },
      select: { id: true, deletedAt: true, name: true },
    });

    expect(restored).toEqual({
      id: user.id,
      name: 'Alice',
      deletedAt: null,
    });

    const visible = await client.user.findUnique({ where: { id: user.id } });
    expect(visible).not.toBeNull();
  });

  it('hardDelete permanently removes a soft-deleted row', async () => {
    const user = await raw.user.create({ data: { name: 'Alice' } });
    await client.user.delete({ where: { id: user.id } });

    const deleted = await client.user.hardDelete({
      where: { id: user.id },
      select: { id: true, name: true },
    });

    expect(deleted).toEqual({
      id: user.id,
      name: 'Alice',
    });

    const found = await raw.user.findFirst({ where: { id: user.id } });
    expect(found).toBeNull();
  });

  it('restoreMany restores only soft-deleted matches', async () => {
    await raw.user.createMany({
      data: [
        { name: 'match', deletedAt: new Date() },
        { name: 'match' },
        { name: 'other', deletedAt: new Date() },
      ],
    });

    const result = await client.user.restoreMany({
      where: { name: 'match' },
    });

    expect(result.count).toBe(1);

    const rows = await raw.user.findMany({ where: { name: 'match' }, orderBy: { id: 'asc' } });
    expect(rows.map((row: any) => row.deletedAt)).toEqual([null, null]);
  });

  it('hardDeleteMany permanently removes only soft-deleted matches', async () => {
    await raw.user.createMany({
      data: [
        { name: 'match', deletedAt: new Date() },
        { name: 'match' },
        { name: 'other', deletedAt: new Date() },
      ],
    });

    const result = await client.user.hardDeleteMany({
      where: { name: 'match' },
    });

    expect(result.count).toBe(1);

    const rows = await raw.user.findMany({ orderBy: { id: 'asc' } });
    expect(rows).toHaveLength(2);
    expect(rows.every((row: any) => row.name !== 'match' || row.deletedAt === null)).toBe(true);
  });

  it('restore throws P2025 for an active row', async () => {
    const user = await raw.user.create({ data: { name: 'Alice' } });

    await expect(client.user.restore({ where: { id: user.id } })).rejects.toMatchObject({
      code: 'P2025',
    });
  });

  it('hardDelete throws P2025 for an active row', async () => {
    const user = await raw.user.create({ data: { name: 'Alice' } });

    await expect(client.user.hardDelete({ where: { id: user.id } })).rejects.toMatchObject({
      code: 'P2025',
    });
  });

  it('restoreMany and hardDeleteMany return zero when no deleted rows match', async () => {
    await raw.user.create({ data: { name: 'Alice' } });

    const restored = await client.user.restoreMany({ where: { name: 'Alice' } });
    const hardDeleted = await client.user.hardDeleteMany({ where: { name: 'Alice' } });

    expect(restored.count).toBe(0);
    expect(hardDeleted.count).toBe(0);
  });

  it('lifecycle helpers throw on unconfigured models', async () => {
    await expect((client.tag.restore as any)({ where: { id: 1 } })).rejects.toThrow(
      'prisma-soft-delete-extension: restore() is only available for configured soft-delete models. Model "Tag" is not configured.'
    );
    await expect((client.tag.hardDelete as any)({ where: { id: 1 } })).rejects.toThrow(
      'prisma-soft-delete-extension: hardDelete() is only available for configured soft-delete models. Model "Tag" is not configured.'
    );
  });
});
