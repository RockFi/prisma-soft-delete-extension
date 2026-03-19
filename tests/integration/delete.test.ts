import {
  createRawClient,
  createTestClient,
  integrationProviders,
  resetDatabase,
  type IntegrationProvider,
} from './harness';

describe.each(integrationProviders)('soft delete: delete and deleteMany (%s)', (provider: IntegrationProvider) => {
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

  it('delete on User sets deletedAt instead of removing the row', async () => {
    const user = await raw.user.create({ data: { name: 'Alice' } });
    await client.user.delete({ where: { id: user.id } });

    const found = await raw.user.findFirst({ where: { id: user.id } });
    expect(found).not.toBeNull();
    expect(found!.deletedAt).not.toBeNull();
  });

  it('deleteMany on User sets deletedAt on matching rows', async () => {
    await raw.user.createMany({ data: [{ name: 'Bob' }, { name: 'Charlie' }] });
    await client.user.deleteMany({ where: {} });

    const users = await raw.user.findMany({});
    expect(users).toHaveLength(2);
    users.forEach((u: any) => expect(u.deletedAt).not.toBeNull());
  });

  it('delete on Tag physically removes the row (passthrough)', async () => {
    const tag = await raw.tag.create({ data: { name: 'typescript' } });
    await client.tag.delete({ where: { id: tag.id } });

    const found = await raw.tag.findFirst({ where: { id: tag.id } });
    expect(found).toBeNull();
  });
});
