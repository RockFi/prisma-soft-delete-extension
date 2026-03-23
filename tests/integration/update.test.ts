import {
  createRawClient,
  createTestClient,
  integrationProviders,
  resetDatabase,
  type IntegrationProvider,
} from './harness';

describe.each(integrationProviders)('soft delete: update paths (%s)', (provider: IntegrationProvider) => {
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

  it('updateMany only updates active rows by default', async () => {
    const active = await raw.user.create({ data: { name: 'match' } });
    const deleted = await raw.user.create({ data: { name: 'match', deletedAt: new Date() } });

    const result = await client.user.updateMany({
      where: { name: 'match' },
      data: { name: 'updated' },
    });

    const activeRow = await raw.user.findUniqueOrThrow({ where: { id: active.id } });
    const deletedRow = await raw.user.findUniqueOrThrow({ where: { id: deleted.id } });

    expect(result.count).toBe(1);
    expect(activeRow.name).toBe('updated');
    expect(deletedRow.name).toBe('match');
  });

  it('updateMany can explicitly target deleted rows', async () => {
    const active = await raw.user.create({ data: { name: 'match' } });
    const deleted = await raw.user.create({ data: { name: 'match', deletedAt: new Date() } });

    const result = await client.user.updateMany({
      where: {
        name: 'match',
        deletedAt: { not: null },
      },
      data: { name: 'deleted-updated' },
    });

    const activeRow = await raw.user.findUniqueOrThrow({ where: { id: active.id } });
    const deletedRow = await raw.user.findUniqueOrThrow({ where: { id: deleted.id } });

    expect(result.count).toBe(1);
    expect(activeRow.name).toBe('match');
    expect(deletedRow.name).toBe('deleted-updated');
  });

  it('nested toMany updateMany only updates active related rows by default', async () => {
    const user = await raw.user.create({ data: { name: 'Alice' } });
    const post = await raw.post.create({ data: { title: 'Post', authorId: user.id } });
    const active = await raw.comment.create({
      data: { content: 'match', authorId: user.id, postId: post.id },
    });
    const deleted = await raw.comment.create({
      data: { content: 'match', authorId: user.id, postId: post.id, deletedAt: new Date() },
    });

    const result = await client.user.update({
      where: { id: user.id },
      data: {
        comments: {
          updateMany: {
            where: { content: 'match' },
            data: { content: 'updated' },
          },
        },
      },
    });

    const activeRow = await raw.comment.findUniqueOrThrow({ where: { id: active.id } });
    const deletedRow = await raw.comment.findUniqueOrThrow({ where: { id: deleted.id } });

    expect(result.id).toBe(user.id);
    expect(activeRow.content).toBe('updated');
    expect(deletedRow.content).toBe('match');
  });

  it('nested toMany updateMany preserves explicit deletedAt predicates', async () => {
    const user = await raw.user.create({ data: { name: 'Alice' } });
    const post = await raw.post.create({ data: { title: 'Post', authorId: user.id } });
    const active = await raw.comment.create({
      data: { content: 'match', authorId: user.id, postId: post.id },
    });
    const deleted = await raw.comment.create({
      data: { content: 'match', authorId: user.id, postId: post.id, deletedAt: new Date() },
    });

    await client.user.update({
      where: { id: user.id },
      data: {
        comments: {
          updateMany: {
            where: {
              content: 'match',
              deletedAt: { not: null },
            },
            data: { content: 'deleted-updated' },
          },
        },
      },
    });

    const activeRow = await raw.comment.findUniqueOrThrow({ where: { id: active.id } });
    const deletedRow = await raw.comment.findUniqueOrThrow({ where: { id: deleted.id } });

    expect(activeRow.content).toBe('match');
    expect(deletedRow.content).toBe('deleted-updated');
  });

  it('throws on nested toOne update for a soft-deleted model', async () => {
    const user = await raw.user.create({ data: { name: 'Alice' } });
    const post = await raw.post.create({ data: { title: 'Post', authorId: user.id } });

    await expect(
      client.post.update({
        where: { id: post.id },
        data: {
          author: {
            update: {
              name: 'Updated',
            },
          },
        },
      })
    ).rejects.toThrow(
      'prisma-soft-delete-extension: update of model "User" through "Post.author" found. Updates of soft deleted models through a toOne relation is not supported as it is possible to update a soft deleted record.'
    );
  });

  it('throws on nested toOne upsert for a soft-deleted model', async () => {
    const user = await raw.user.create({ data: { name: 'Alice' } });
    const post = await raw.post.create({ data: { title: 'Post', authorId: user.id } });

    await expect(
      client.post.update({
        where: { id: post.id },
        data: {
          author: {
            upsert: {
              update: {
                name: 'Updated',
              },
              create: {
                name: 'Created',
              },
            },
          },
        },
      })
    ).rejects.toThrow(
      'prisma-soft-delete-extension: upsert of model "User" through "Post.author" found. Upserts of soft deleted models through a toOne relation is not supported as it is possible to update a soft deleted record.'
    );
  });

  it('root update remains passthrough', async () => {
    const deleted = await raw.user.create({
      data: { name: 'Deleted', deletedAt: new Date() },
    });

    const result = await client.user.update({
      where: { id: deleted.id },
      data: { name: 'Still updatable' },
    });

    expect(result.id).toBe(deleted.id);
    const row = await raw.user.findUniqueOrThrow({ where: { id: deleted.id } });
    expect(row.name).toBe('Still updatable');
    expect(row.deletedAt).not.toBeNull();
  });

  it('root upsert remains passthrough', async () => {
    const deleted = await raw.user.create({
      data: { name: 'Deleted', deletedAt: new Date() },
    });

    const result = await client.user.upsert({
      where: { id: deleted.id },
      create: { name: 'Created' },
      update: { name: 'Upserted' },
    });

    expect(result.id).toBe(deleted.id);
    const row = await raw.user.findUniqueOrThrow({ where: { id: deleted.id } });
    expect(row.name).toBe('Upserted');
  });

  it('nested toMany update remains passthrough', async () => {
    const user = await raw.user.create({ data: { name: 'Alice' } });
    const post = await raw.post.create({ data: { title: 'Post', authorId: user.id } });
    const deletedComment = await raw.comment.create({
      data: { content: 'Deleted', authorId: user.id, postId: post.id, deletedAt: new Date() },
    });

    await client.user.update({
      where: { id: user.id },
      data: {
        comments: {
          update: {
            where: { id: deletedComment.id },
            data: { content: 'Updated deleted' },
          },
        },
      },
    });

    const row = await raw.comment.findUniqueOrThrow({ where: { id: deletedComment.id } });
    expect(row.content).toBe('Updated deleted');
  });

  it('nested toMany upsert remains passthrough', async () => {
    const user = await raw.user.create({ data: { name: 'Alice' } });
    const post = await raw.post.create({ data: { title: 'Post', authorId: user.id } });
    const deletedComment = await raw.comment.create({
      data: { content: 'Deleted', authorId: user.id, postId: post.id, deletedAt: new Date() },
    });

    await client.user.update({
      where: { id: user.id },
      data: {
        comments: {
          upsert: {
            where: { id: deletedComment.id },
            update: { content: 'Upserted deleted' },
            create: { content: 'Created comment', postId: post.id },
          },
        },
      },
    });

    const row = await raw.comment.findUniqueOrThrow({ where: { id: deletedComment.id } });
    expect(row.content).toBe('Upserted deleted');
  });
});
