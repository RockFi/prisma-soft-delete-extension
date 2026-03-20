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

  it('includeSoftDeleted: true also bypasses nested toMany filtering', async () => {
    const user = await raw.user.create({ data: { name: 'Alice' } });
    const post = await raw.post.create({ data: { title: 'Post', authorId: user.id } });

    await raw.comment.createMany({
      data: [
        { content: 'Active', authorId: user.id, postId: post.id },
        { content: 'Deleted', authorId: user.id, postId: post.id, deletedAt: new Date() },
      ],
    });

    const result = await (client.user.findUniqueOrThrow as any)({
      where: { id: user.id },
      include: { comments: true },
      includeSoftDeleted: true,
    });

    expect(result.comments).toHaveLength(2);
  });

  it('includeSoftDeleted: true also bypasses toOne result filtering', async () => {
    const profile = await raw.profile.create({
      data: { bio: 'Deleted', deletedAt: new Date() },
    });
    const user = await raw.user.create({
      data: { name: 'Alice', profileId: profile.id },
    });

    const result = await (client.user.findUniqueOrThrow as any)({
      where: { id: user.id },
      include: { profile: true },
      includeSoftDeleted: true,
    });

    expect(result.profile).not.toBeNull();
    expect(result.profile.bio).toBe('Deleted');
  });
});
