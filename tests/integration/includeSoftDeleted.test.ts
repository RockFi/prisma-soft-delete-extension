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

describe('includeSoftDeleted option', () => {
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
    client = createTestClient();
  });

  afterEach(async () => {
    await (client as any).$disconnect();
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
});
