import {
  createRawClient,
  createTestClient,
  integrationProviders,
  resetDatabase,
  type IntegrationProvider,
} from './harness';

describe.each(integrationProviders)('soft delete: find operations (%s)', (provider: IntegrationProvider) => {
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

  it('findMany excludes soft-deleted Users', async () => {
    await raw.user.create({ data: { name: 'Active' } });
    await raw.user.create({ data: { name: 'Deleted', deletedAt: new Date() } });

    const users = await client.user.findMany({});
    expect(users).toHaveLength(1);
    expect(users[0].name).toBe('Active');
  });

  it('findFirst excludes soft-deleted Users', async () => {
    await raw.user.create({ data: { name: 'Deleted', deletedAt: new Date() } });
    await raw.user.create({ data: { name: 'Active' } });

    const user = await client.user.findFirst({ where: {} });
    expect(user).not.toBeNull();
    expect(user!.name).toBe('Active');
  });

  it('findUnique returns null for soft-deleted User', async () => {
    const u = await raw.user.create({ data: { name: 'Gone', deletedAt: new Date() } });

    const result = await client.user.findUnique({ where: { id: u.id } });
    expect(result).toBeNull();
  });

  it('findUniqueOrThrow throws P2025 for soft-deleted User', async () => {
    const u = await raw.user.create({ data: { name: 'Gone', deletedAt: new Date() } });

    await expect(client.user.findUniqueOrThrow({ where: { id: u.id } })).rejects.toMatchObject({
      code: 'P2025',
    });
  });

  it('findMany on Tag works normally (passthrough)', async () => {
    await raw.tag.createMany({ data: [{ name: 'ts' }, { name: 'js' }] });
    const tags = await client.tag.findMany({});
    expect(tags).toHaveLength(2);
  });
});
