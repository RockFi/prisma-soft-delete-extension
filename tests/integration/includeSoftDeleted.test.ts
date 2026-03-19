import {
  createRawClient,
  createTestClient,
  integrationProviders,
  resetDatabase,
  type IntegrationProvider,
} from './harness';

describe.each(integrationProviders)('includeSoftDeleted option (%s)', (provider: IntegrationProvider) => {
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

  it('findMany with includeSoftDeleted: true returns deleted and active', async () => {
    await raw.user.create({ data: { name: 'Active' } });
    await raw.user.create({ data: { name: 'Deleted', deletedAt: new Date() } });

    const users = await (client.user.findMany as any)({ includeSoftDeleted: true });
    expect(users).toHaveLength(2);
  });

  it('findFirst with includeSoftDeleted: true can return a deleted record', async () => {
    await raw.user.create({ data: { name: 'Deleted', deletedAt: new Date() } });

    const user = await (client.user.findFirst as any)({ includeSoftDeleted: true });
    expect(user).not.toBeNull();
    expect(user!.name).toBe('Deleted');
  });

  it('findMany with includeSoftDeleted: false behaves same as default', async () => {
    await raw.user.create({ data: { name: 'Active' } });
    await raw.user.create({ data: { name: 'Deleted', deletedAt: new Date() } });

    const users = await (client.user.findMany as any)({ includeSoftDeleted: false });
    expect(users).toHaveLength(1);
    expect(users[0].name).toBe('Active');
  });
});
