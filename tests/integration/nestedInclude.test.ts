import {
  createRawClient,
  createTestClient,
  integrationProviders,
  resetDatabase,
  type IntegrationProvider,
} from './harness';

describe.each(integrationProviders)('soft delete: nested include (%s)', (provider: IntegrationProvider) => {
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

  it('filters deleted records from toMany includes', async () => {
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
      include: { comments: true },
    });

    expect(result.comments).toHaveLength(1);
    expect(result.comments[0].content).toBe('active');
  });

  it('filters deleted records from toMany includes with existing where', async () => {
    const user = await raw.user.create({ data: { name: 'Alice' } });
    const post = await raw.post.create({ data: { title: 'Post', authorId: user.id } });

    await raw.comment.createMany({
      data: [
        { content: 'deleted-only', authorId: user.id, postId: post.id, deletedAt: new Date() },
        { content: 'other', authorId: user.id, postId: post.id },
      ],
    });

    const result = await client.user.findUniqueOrThrow({
      where: { id: user.id },
      include: {
        comments: {
          where: { content: 'deleted-only' },
        },
      },
    });

    expect(result.comments).toHaveLength(0);
  });

  it('returns null for soft-deleted toOne includes', async () => {
    const profile = await raw.profile.create({
      data: { bio: 'bio', deletedAt: new Date() },
    });
    const user = await raw.user.create({
      data: { name: 'Alice', profileId: profile.id },
    });

    const result = await client.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { profile: true },
    });

    expect(result.profile).toBeNull();
  });

  it('filters deleted records in deeply nested includes', async () => {
    const user = await raw.user.create({ data: { name: 'Alice' } });
    const post = await raw.post.create({ data: { title: 'Post', authorId: user.id } });
    const rootComment = await raw.comment.create({
      data: { content: 'root', authorId: user.id, postId: post.id },
    });

    await raw.comment.createMany({
      data: [
        { content: 'reply-active', authorId: null, postId: post.id, repliedToId: rootComment.id },
        {
          content: 'reply-deleted',
          authorId: null,
          postId: post.id,
          repliedToId: rootComment.id,
          deletedAt: new Date(),
        },
      ],
    });

    const result = await client.user.findUniqueOrThrow({
      where: { id: user.id },
      include: {
        comments: {
          include: {
            replies: true,
          },
        },
      },
    });

    expect(result.comments).toHaveLength(1);
    expect(result.comments[0].replies).toHaveLength(1);
    expect(result.comments[0].replies[0].content).toBe('reply-active');
  });

  it('preserves explicit deletedAt predicates in nested includes', async () => {
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
      include: {
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
