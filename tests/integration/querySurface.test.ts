import {
  createRawClient,
  createTestClient,
  integrationProviders,
  resetDatabase,
  type IntegrationProvider,
} from './harness';

describe.each(integrationProviders)('soft delete: query surface (%s)', (provider: IntegrationProvider) => {
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

  it('count excludes soft-deleted rows by default and includeSoftDeleted can bypass it', async () => {
    await raw.user.createMany({
      data: [
        { name: 'Active' },
        { name: 'Deleted', deletedAt: new Date() },
      ],
    });

    const activeCount = await client.user.count();
    const allCount = await (client.user.count as any)({ includeSoftDeleted: true });

    expect(activeCount).toBe(1);
    expect(allCount).toBe(2);
  });

  it('aggregate excludes soft-deleted rows by default and preserves explicit deletedAt overrides', async () => {
    await raw.user.createMany({
      data: [
        { name: 'Active' },
        { name: 'Deleted', deletedAt: new Date() },
      ],
    });

    const activeAggregate = await client.user.aggregate({
      _count: { _all: true },
    });
    const deletedAggregate = await client.user.aggregate({
      _count: { _all: true },
      where: {
        deletedAt: { not: null },
      },
    });

    expect(activeAggregate._count._all).toBe(1);
    expect(deletedAggregate._count._all).toBe(1);
  });

  it('groupBy excludes soft-deleted rows by default, supports includeSoftDeleted, and preserves explicit overrides', async () => {
    await raw.user.createMany({
      data: [
        { name: 'Shared' },
        { name: 'Shared', deletedAt: new Date() },
      ],
    });

    const activeGroups = await client.user.groupBy({
      by: ['name'],
      _count: { _all: true },
    });
    const allGroups = await (client.user.groupBy as any)({
      by: ['name'],
      _count: { _all: true },
      includeSoftDeleted: true,
    });
    const deletedGroups = await client.user.groupBy({
      by: ['name'],
      _count: { _all: true },
      where: {
        deletedAt: { not: null },
      },
    });

    expect(activeGroups).toEqual([{ name: 'Shared', _count: { _all: 1 } }]);
    expect(allGroups).toEqual([{ name: 'Shared', _count: { _all: 2 } }]);
    expect(deletedGroups).toEqual([{ name: 'Shared', _count: { _all: 1 } }]);
  });

  it('count filters configured self-relations and preserves explicit deletedAt overrides in deep trees', async () => {
    const user = await raw.user.create({ data: { name: 'Alice' } });
    const post = await raw.post.create({ data: { title: 'Post', authorId: user.id } });
    const root = await raw.comment.create({
      data: { content: 'root', authorId: user.id, postId: post.id },
    });

    await raw.comment.create({
      data: {
        content: 'deleted-reply',
        postId: post.id,
        repliedToId: root.id,
        deletedAt: new Date(),
      },
    });

    const filteredCount = await client.comment.count({
      where: {
        replies: {
          some: {
            content: 'deleted-reply',
          },
        },
      },
    });
    const overriddenCount = await client.comment.count({
      where: {
        replies: {
          some: {
            AND: [
              { content: 'deleted-reply' },
              {
                OR: [{ deletedAt: { not: null } }],
              },
            ],
          },
        },
      },
    });

    expect(filteredCount).toBe(0);
    expect(overriddenCount).toBe(1);
  });

  it('aggregate filters configured self-relations by default', async () => {
    const user = await raw.user.create({ data: { name: 'Alice' } });
    const post = await raw.post.create({ data: { title: 'Post', authorId: user.id } });
    const root = await raw.comment.create({
      data: { content: 'root', authorId: user.id, postId: post.id },
    });

    await raw.comment.createMany({
      data: [
        { content: 'active-reply', postId: post.id, repliedToId: root.id },
        { content: 'deleted-reply', postId: post.id, repliedToId: root.id, deletedAt: new Date() },
      ],
    });

    const result = await client.comment.aggregate({
      _count: { _all: true },
      where: {
        replies: {
          some: {
            content: 'deleted-reply',
          },
        },
      },
    });

    expect(result._count._all).toBe(0);
  });

  it('groupBy filters configured self-relations by default and includeSoftDeleted bypasses that filter', async () => {
    const user = await raw.user.create({ data: { name: 'Alice' } });
    const post = await raw.post.create({ data: { title: 'Post', authorId: user.id } });
    const root = await raw.comment.create({
      data: { content: 'root', authorId: user.id, postId: post.id },
    });

    await raw.comment.create({
      data: {
        content: 'deleted-reply',
        postId: post.id,
        repliedToId: root.id,
        deletedAt: new Date(),
      },
    });

    const filteredGroups = await client.comment.groupBy({
      by: ['content'],
      _count: { _all: true },
      where: {
        replies: {
          some: {
            content: 'deleted-reply',
          },
        },
      },
    });
    const allGroups = await (client.comment.groupBy as any)({
      by: ['content'],
      _count: { _all: true },
      where: {
        replies: {
          some: {
            content: 'deleted-reply',
          },
        },
      },
      includeSoftDeleted: true,
    });

    expect(filteredGroups).toEqual([]);
    expect(allGroups).toEqual([{ content: 'root', _count: { _all: 1 } }]);
  });

  it('count continues filtering configured branches after traversing an unconfigured relation', async () => {
    const user = await raw.user.create({ data: { name: 'Alice' } });
    const activePost = await raw.post.create({ data: { title: 'Active tagged', authorId: user.id } });
    const deletedPost = await raw.post.create({
      data: { title: 'Deleted tagged', authorId: user.id, deletedAt: new Date() },
    });

    await raw.tag.create({
      data: {
        name: 'shared',
        posts: {
          connect: [{ id: activePost.id }, { id: deletedPost.id }],
        },
      },
    });

    const filteredCount = await client.user.count({
      where: {
        posts: {
          some: {
            tags: {
              some: {
                posts: {
                  some: {
                    title: 'Deleted tagged',
                  },
                },
              },
            },
          },
        },
      },
    });
    const overriddenCount = await client.user.count({
      where: {
        posts: {
          some: {
            tags: {
              some: {
                posts: {
                  some: {
                    title: 'Deleted tagged',
                    deletedAt: { not: null },
                  },
                },
              },
            },
          },
        },
      },
    });

    expect(filteredCount).toBe(0);
    expect(overriddenCount).toBe(1);
  });
});
