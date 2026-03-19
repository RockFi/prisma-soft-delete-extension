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

describe('soft delete: delete and deleteMany', () => {
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
    users.forEach((u) => expect(u.deletedAt).not.toBeNull());
  });

  it('delete on Tag physically removes the row (passthrough)', async () => {
    const tag = await raw.tag.create({ data: { name: 'typescript' } });
    await client.tag.delete({ where: { id: tag.id } });

    const found = await raw.tag.findFirst({ where: { id: tag.id } });
    expect(found).toBeNull();
  });
});
