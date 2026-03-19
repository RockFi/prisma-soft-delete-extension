import { createTestClient } from './setup';
import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import path from 'path';

const DB_PATH = path.join(__dirname, '../../.test.db');
const DB_URL = 'file:' + DB_PATH;

function createRawClient() {
  const adapter = new PrismaBetterSqlite3({ url: DB_URL });
  return new PrismaClient({ adapter } as any);
}

describe('soft delete: find operations', () => {
  let client: ReturnType<typeof createTestClient>;
  let raw: PrismaClient;

  beforeAll(() => {
    raw = createRawClient();
  });

  afterAll(async () => {
    await raw.$disconnect();
  });

  beforeEach(async () => {
    await raw.$executeRawUnsafe('DELETE FROM "User"');
    await raw.$executeRawUnsafe('DELETE FROM "Tag"');
    client = createTestClient();
  });

  afterEach(async () => {
    await (client as any).$disconnect();
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
