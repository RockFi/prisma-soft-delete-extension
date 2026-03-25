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

  it('root update only updates active rows by default', async () => {
    const deleted = await raw.user.create({
      data: { name: 'Deleted', deletedAt: new Date() },
    });

    await expect(
      client.user.update({
        where: { id: deleted.id },
        data: { name: 'Still updatable' },
      })
    ).rejects.toMatchObject({
      code: 'P2025',
    });

    const row = await raw.user.findUniqueOrThrow({ where: { id: deleted.id } });
    expect(row.name).toBe('Deleted');
    expect(row.deletedAt).not.toBeNull();
  });

  it('root update preserves explicit deletedAt overrides', async () => {
    const deleted = await raw.user.create({
      data: { name: 'Deleted', deletedAt: new Date() },
    });

    const result = await client.user.update({
      where: {
        id: deleted.id,
        deletedAt: { not: null },
      },
      data: { name: 'Restored target' },
    });

    expect(result.id).toBe(deleted.id);
    const row = await raw.user.findUniqueOrThrow({ where: { id: deleted.id } });
    expect(row.name).toBe('Restored target');
  });

  it('root upsert throws when the target row is soft-deleted', async () => {
    const deleted = await raw.user.create({
      data: { name: 'Deleted', deletedAt: new Date() },
    });

    await expect(
      client.user.upsert({
        where: { id: deleted.id },
        create: { name: 'Created' },
        update: { name: 'Upserted' },
      })
    ).rejects.toThrow(
      'prisma-soft-delete-extension: upsert of model "User" found a soft deleted record. Restore it with "restore()" or permanently remove it with "hardDelete()" before calling upsert().'
    );

    const row = await raw.user.findUniqueOrThrow({ where: { id: deleted.id } });
    expect(row.name).toBe('Deleted');
  });

  it('root upsert still updates active rows', async () => {
    const active = await raw.user.create({
      data: { name: 'Active' },
    });

    const result = await client.user.upsert({
      where: { id: active.id },
      create: { name: 'Created' },
      update: { name: 'Upserted active' },
    });

    expect(result.id).toBe(active.id);
    const row = await raw.user.findUniqueOrThrow({ where: { id: active.id } });
    expect(row.name).toBe('Upserted active');
  });

  it('nested toMany update only updates active rows by default', async () => {
    const user = await raw.user.create({ data: { name: 'Alice' } });
    const post = await raw.post.create({ data: { title: 'Post', authorId: user.id } });
    const deletedComment = await raw.comment.create({
      data: { content: 'Deleted', authorId: user.id, postId: post.id, deletedAt: new Date() },
    });

    await expect(
      client.user.update({
        where: { id: user.id },
        data: {
          comments: {
            update: {
              where: { id: deletedComment.id },
              data: { content: 'Updated deleted' },
            },
          },
        },
      })
    ).rejects.toMatchObject({
      code: 'P2025',
    });

    const row = await raw.comment.findUniqueOrThrow({ where: { id: deletedComment.id } });
    expect(row.content).toBe('Deleted');
  });

  it('nested toMany update preserves explicit deletedAt overrides', async () => {
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
            where: {
              id: deletedComment.id,
              deletedAt: { not: null },
            },
            data: { content: 'Updated deleted' },
          },
        },
      },
    });

    const row = await raw.comment.findUniqueOrThrow({ where: { id: deletedComment.id } });
    expect(row.content).toBe('Updated deleted');
  });

  it('nested toMany delete throws for a configured soft-delete model', async () => {
    const user = await raw.user.create({ data: { name: 'Alice' } });
    const post = await raw.post.create({ data: { title: 'Post', authorId: user.id } });
    const comment = await raw.comment.create({
      data: { content: 'Delete me', authorId: user.id, postId: post.id },
    });

    await expect(
      client.user.update({
        where: { id: user.id },
        data: {
          comments: {
            delete: { id: comment.id },
          },
        },
      })
    ).rejects.toThrow(
      'prisma-soft-delete-extension: delete of model "Comment" through "User.comments" found. Nested hard deletes for configured soft-delete models are not supported because they bypass soft delete and permanently remove rows.'
    );

    const row = await raw.comment.findUnique({ where: { id: comment.id } });
    expect(row).not.toBeNull();
    expect(row!.deletedAt).toBeNull();
  });

  it('nested toMany deleteMany throws for a configured soft-delete model', async () => {
    const user = await raw.user.create({ data: { name: 'Alice' } });
    const post = await raw.post.create({ data: { title: 'Post', authorId: user.id } });
    await raw.comment.createMany({
      data: [
        { content: 'Delete me', authorId: user.id, postId: post.id },
        { content: 'Delete me too', authorId: user.id, postId: post.id },
      ],
    });

    await expect(
      client.user.update({
        where: { id: user.id },
        data: {
          comments: {
            deleteMany: { content: { startsWith: 'Delete me' } },
          },
        },
      })
    ).rejects.toThrow(
      'prisma-soft-delete-extension: deleteMany of model "Comment" through "User.comments" found. Nested hard deletes for configured soft-delete models are not supported because they bypass soft delete and permanently remove rows.'
    );

    const rows = await raw.comment.findMany({ where: { postId: post.id } });
    expect(rows).toHaveLength(2);
    rows.forEach((row: any) => expect(row.deletedAt).toBeNull());
  });

  it('nested toOne delete throws for a configured soft-delete model', async () => {
    const profile = await raw.profile.create({ data: { bio: 'Delete me' } });
    const user = await raw.user.create({
      data: { name: 'Alice', profileId: profile.id },
    });

    await expect(
      client.user.update({
        where: { id: user.id },
        data: {
          profile: {
            delete: true,
          },
        },
      })
    ).rejects.toThrow(
      'prisma-soft-delete-extension: delete of model "Profile" through "User.profile" found. Nested hard deletes for configured soft-delete models are not supported because they bypass soft delete and permanently remove rows.'
    );

    const row = await raw.profile.findUnique({ where: { id: profile.id } });
    expect(row).not.toBeNull();
    expect(row!.deletedAt).toBeNull();
  });

  it('nested delete remains passthrough for an unconfigured model', async () => {
    const user = await raw.user.create({ data: { name: 'Alice' } });
    const post = await raw.post.create({ data: { title: 'Post', authorId: user.id } });
    const tag = await raw.tag.create({
      data: {
        name: 'delete-me',
        posts: {
          connect: { id: post.id },
        },
      },
    });

    await client.post.update({
      where: { id: post.id },
      data: {
        tags: {
          delete: { id: tag.id },
        },
      },
    });

    const row = await raw.tag.findUnique({ where: { id: tag.id } });
    expect(row).toBeNull();
  });

  it('nested deleteMany remains passthrough for an unconfigured model', async () => {
    const user = await raw.user.create({ data: { name: 'Alice' } });
    const post = await raw.post.create({ data: { title: 'Post', authorId: user.id } });

    await raw.tag.create({
      data: {
        name: 'delete-me',
        posts: {
          connect: { id: post.id },
        },
      },
    });
    await raw.tag.create({
      data: {
        name: 'delete-me-too',
        posts: {
          connect: { id: post.id },
        },
      },
    });

    await client.post.update({
      where: { id: post.id },
      data: {
        tags: {
          deleteMany: { name: { startsWith: 'delete-me' } },
        },
      },
    });

    const rows = await raw.tag.findMany({});
    expect(rows).toHaveLength(0);
  });

  it('nested toMany upsert throws when the target row is soft-deleted', async () => {
    const user = await raw.user.create({ data: { name: 'Alice' } });
    const post = await raw.post.create({ data: { title: 'Post', authorId: user.id } });
    const deletedComment = await raw.comment.create({
      data: { content: 'Deleted', authorId: user.id, postId: post.id, deletedAt: new Date() },
    });

    await expect(
      client.user.update({
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
      })
    ).rejects.toThrow(
      'prisma-soft-delete-extension: upsert of model "Comment" through "User.comments" found a soft deleted record. Restore it with "restore()" or permanently remove it with "hardDelete()" before calling upsert().'
    );

    const row = await raw.comment.findUniqueOrThrow({ where: { id: deletedComment.id } });
    expect(row.content).toBe('Deleted');
  });

  it('nested toMany upsert still updates active rows', async () => {
    const user = await raw.user.create({ data: { name: 'Alice' } });
    const post = await raw.post.create({ data: { title: 'Post', authorId: user.id } });
    const activeComment = await raw.comment.create({
      data: { content: 'Active', authorId: user.id, postId: post.id },
    });

    await client.user.update({
      where: { id: user.id },
      data: {
        comments: {
          upsert: {
            where: { id: activeComment.id },
            update: { content: 'Upserted active' },
            create: { content: 'Created comment', postId: post.id },
          },
        },
      },
    });

    const row = await raw.comment.findUniqueOrThrow({ where: { id: activeComment.id } });
    expect(row.content).toBe('Upserted active');
  });

  it('updateManyAndReturn only updates active rows by default', async () => {
    const active = await raw.user.create({ data: { name: 'match' } });
    const deleted = await raw.user.create({ data: { name: 'match', deletedAt: new Date() } });

    const result = await client.user.updateManyAndReturn({
      where: { name: 'match' },
      data: { name: 'updated' },
    });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(active.id);

    const activeRow = await raw.user.findUniqueOrThrow({ where: { id: active.id } });
    const deletedRow = await raw.user.findUniqueOrThrow({ where: { id: deleted.id } });
    expect(activeRow.name).toBe('updated');
    expect(deletedRow.name).toBe('match');
  });

  it('updateManyAndReturn preserves explicit deletedAt overrides', async () => {
    const active = await raw.user.create({ data: { name: 'match' } });
    const deleted = await raw.user.create({ data: { name: 'match', deletedAt: new Date() } });

    const result = await client.user.updateManyAndReturn({
      where: {
        name: 'match',
        deletedAt: { not: null },
      },
      data: { name: 'deleted-updated' },
    });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(deleted.id);

    const activeRow = await raw.user.findUniqueOrThrow({ where: { id: active.id } });
    const deletedRow = await raw.user.findUniqueOrThrow({ where: { id: deleted.id } });
    expect(activeRow.name).toBe('match');
    expect(deletedRow.name).toBe('deleted-updated');
  });
});
