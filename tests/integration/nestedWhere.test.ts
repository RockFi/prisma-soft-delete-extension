import {
  createRawClient,
  createTestClient,
  integrationProviders,
  resetDatabase,
  type IntegrationProvider,
} from './harness';

describe.each(integrationProviders)('soft delete: nested where (%s)', (provider: IntegrationProvider) => {
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

  it('filters deleted records from some relation predicates', async () => {
    const user = await raw.user.create({ data: { name: 'Alice' } });
    const post = await raw.post.create({ data: { title: 'Post', authorId: user.id } });

    await raw.comment.createMany({
      data: [
        { content: 'active-match', authorId: user.id, postId: post.id },
        { content: 'deleted-only', authorId: user.id, postId: post.id, deletedAt: new Date() },
      ],
    });

    const found = await client.user.findFirst({
      where: { comments: { some: { content: 'active-match' } } },
    });
    const notFound = await client.user.findFirst({
      where: { comments: { some: { content: 'deleted-only' } } },
    });

    expect(found?.id).toBe(user.id);
    expect(notFound).toBeNull();
  });

  it('filters deleted records correctly for every relation predicates', async () => {
    const user = await raw.user.create({ data: { name: 'Alice' } });
    const post = await raw.post.create({ data: { title: 'Post', authorId: user.id } });

    await raw.comment.createMany({
      data: [
        { content: 'foo', authorId: user.id, postId: post.id },
        { content: 'bar', authorId: user.id, postId: post.id, deletedAt: new Date() },
      ],
    });

    const found = await client.user.findFirst({
      where: { comments: { every: { content: 'foo' } } },
    });
    const notFound = await client.user.findFirst({
      where: { comments: { every: { content: 'bar' } } },
    });

    expect(found?.id).toBe(user.id);
    expect(notFound).toBeNull();
  });

  it('filters deleted records from toOne is predicates', async () => {
    const profile = await raw.profile.create({ data: { bio: 'visible' } });
    const user = await raw.user.create({ data: { name: 'Alice', profileId: profile.id } });

    const found = await client.user.findFirst({
      where: { profile: { is: { bio: 'visible' } } },
    });

    await raw.profile.update({
      where: { id: profile.id },
      data: { deletedAt: new Date() },
    });

    const notFound = await client.user.findFirst({
      where: { profile: { is: { bio: 'visible' } } },
    });

    expect(found?.id).toBe(user.id);
    expect(notFound).toBeNull();
  });

  it('preserves explicit deletedAt predicates in nested where', async () => {
    const user = await raw.user.create({ data: { name: 'Alice' } });
    const post = await raw.post.create({ data: { title: 'Post', authorId: user.id } });
    const deletedAt = new Date();

    await raw.comment.create({
      data: {
        content: 'deleted-only',
        authorId: user.id,
        postId: post.id,
        deletedAt,
      },
    });

    const found = await client.user.findFirst({
      where: {
        comments: {
          some: {
            content: 'deleted-only',
            deletedAt: { not: null },
          },
        },
      },
    });

    expect(found?.id).toBe(user.id);
  });

  it('filters deleted records through nested NOT clauses', async () => {
    const user = await raw.user.create({ data: { name: 'Alice' } });
    const post = await raw.post.create({ data: { title: 'Post', authorId: user.id } });

    await raw.comment.createMany({
      data: [
        { content: 'foo', authorId: user.id, postId: post.id },
        { content: 'bar', authorId: user.id, postId: post.id, deletedAt: new Date() },
      ],
    });

    const found = await client.user.findFirst({
      where: { NOT: { comments: { some: { content: 'bar' } } } },
    });
    const notFound = await client.user.findFirst({
      where: { NOT: { comments: { some: { content: 'foo' } } } },
    });

    expect(found?.id).toBe(user.id);
    expect(notFound).toBeNull();
  });
});
