import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { createSoftDeleteExtension } from '../../src/index';
import path from 'path';
import { execSync } from 'child_process';

const DB_PATH = path.join(__dirname, '../../.test.db');
const DB_URL = 'file:' + DB_PATH;

export default async function globalSetup() {
  // Push the schema to create/update the SQLite file
  execSync(
    `node_modules/.bin/prisma db push --schema=tests/integration/schema.prisma --url=${DB_URL} --accept-data-loss`,
    {
      cwd: path.join(__dirname, '../../'),
      stdio: 'inherit',
    }
  );
}

export function createTestClient() {
  const adapter = new PrismaBetterSqlite3({ url: DB_URL });
  const prisma = new PrismaClient({ adapter } as any);
  return prisma.$extends(
    createSoftDeleteExtension({
      models: {
        User: true,
        // Tag is intentionally omitted — passthrough
      },
    })
  );
}
