import {
  createRawClient,
  createTestClient,
  integrationProviders,
  resetDatabase,
  type IntegrationProvider,
} from './harness';

describe.each(integrationProviders)('soft delete: nested select (%s)', (provider: IntegrationProvider) => {
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

  it('filters deleted records from toMany selects', async () => {
    const user = await raw.user.create({ data: { name: 'Alice' } });
    const post = await raw.post.create({ data: { title: 'Post', authorId: user.id } });

    await raw.comment.createMany({
      data: [
        { content: 'active', authorId: user.id, postId: post.id },
        { content: 'deleted', authorId: user.id, postId: post.id, deletedAt: new Date() },
      ],
    });

    const result = await client.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { comments: true },
    });

    expect(result.comments).toHaveLength(1);
    expect(result.comments[0].content).toBe('active');
  });

  it('returns null for soft-deleted toOne selects and strips deletedAt from result', async () => {
    const activeProfile = await raw.profile.create({ data: { bio: 'active' } });
    const activeUser = await raw.user.create({
      data: { name: 'Alice', profileId: activeProfile.id },
    });

    const activeResult = await client.user.findUniqueOrThrow({
      where: { id: activeUser.id },
      select: {
        profile: {
          select: {
            id: true,
            bio: true,
          },
        },
      },
    });

    expect(activeResult.profile).toEqual({
      id: activeProfile.id,
      bio: 'active',
    });
    expect('deletedAt' in activeResult.profile).toBe(false);

    const deletedProfile = await raw.profile.create({
      data: { bio: 'deleted', deletedAt: new Date() },
    });
    const deletedUser = await raw.user.create({
      data: { name: 'Bob', profileId: deletedProfile.id },
    });

    const deletedResult = await client.user.findUniqueOrThrow({
      where: { id: deletedUser.id },
      select: {
        profile: {
          select: {
            id: true,
            bio: true,
          },
        },
      },
    });

    expect(deletedResult.profile).toBeNull();
  });

  it('filters deleted records from nested select inside include', async () => {
    const user = await raw.user.create({ data: { name: 'Alice' } });
    const post = await raw.post.create({ data: { title: 'Post', authorId: user.id } });

    await raw.comment.createMany({
      data: [
        { content: 'active', authorId: user.id, postId: post.id },
        { content: 'deleted', authorId: user.id, postId: post.id, deletedAt: new Date() },
      ],
    });

    const result = await client.user.findUniqueOrThrow({
      where: { id: user.id },
      include: {
        comments: {
          select: {
            id: true,
            content: true,
          },
        },
      },
    });

    expect(result.comments).toHaveLength(1);
    expect(result.comments[0].content).toBe('active');
  });

  it('preserves explicit deletedAt predicates in nested selects', async () => {
    const user = await raw.user.create({ data: { name: 'Alice' } });
    const post = await raw.post.create({ data: { title: 'Post', authorId: user.id } });

    await raw.comment.create({
      data: {
        content: 'deleted',
        authorId: user.id,
        postId: post.id,
        deletedAt: new Date(),
      },
    });

    const result = await client.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        comments: {
          where: {
            deletedAt: { not: null },
          },
        },
      },
    });

    expect(result.comments).toHaveLength(1);
    expect(result.comments[0].content).toBe('deleted');
  });
});
