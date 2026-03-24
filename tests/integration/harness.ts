import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { createSoftDeleteExtension } from '../../src/index';

export type IntegrationProvider = 'prisma-client-js' | 'prisma-client';

export const integrationProviders: IntegrationProvider[] = ['prisma-client-js', 'prisma-client'];

export const ROOT_DIR = path.join(__dirname, '../../');
export const SCHEMA_PATH = path.join(ROOT_DIR, 'tests/integration/schema.prisma');
export const DB_PATH = path.join(ROOT_DIR, '.test.db');
export const DB_URL = `file:${DB_PATH}`;

const CLIENT_OUTPUTS: Record<IntegrationProvider, string> = {
  'prisma-client-js': path.join(ROOT_DIR, 'tests/integration/generated/prisma-client-js'),
  'prisma-client': path.join(ROOT_DIR, 'tests/integration/generated/prisma-client'),
};

const MODULE_CANDIDATES: Record<IntegrationProvider, string[]> = {
  'prisma-client-js': ['index.js', 'default.js'],
  'prisma-client': ['client.cjs'],
};

const prismaClientModuleCache = new Map<IntegrationProvider, PrismaClientModule>();

type PrismaClientConstructor = new (...args: any[]) => any;

type PrismaClientModule = {
  PrismaClient: PrismaClientConstructor;
};

function runPrisma(command: string) {
  execSync(command, {
    cwd: ROOT_DIR,
    stdio: 'inherit',
  });
}

function compilePrismaClientRuntime() {
  const prismaClientOutput = CLIENT_OUTPUTS['prisma-client'];
  const tsconfigPath = path.join(prismaClientOutput, 'tsconfig.runtime.json');

  fs.writeFileSync(
    tsconfigPath,
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2020',
          module: 'CommonJS',
          moduleResolution: 'node',
          esModuleInterop: true,
          skipLibCheck: true,
          declaration: false,
          rewriteRelativeImportExtensions: true,
          allowImportingTsExtensions: true,
          verbatimModuleSyntax: false,
        },
        include: ['./**/*.cts'],
      },
      null,
      2
    )
  );

  runPrisma(`node_modules/.bin/tsc --project "${tsconfigPath}"`);
}

function cleanGeneratedClients() {
  fs.rmSync(path.join(ROOT_DIR, 'tests/integration/generated'), {
    recursive: true,
    force: true,
  });
}

function loadPrismaClientModule(provider: IntegrationProvider): PrismaClientModule {
  const cached = prismaClientModuleCache.get(provider);
  if (cached) {
    return cached;
  }

  const outputDir = CLIENT_OUTPUTS[provider];
  const entrypoint = MODULE_CANDIDATES[provider]
    .map((candidate) => path.join(outputDir, candidate))
    .find((candidate) => fs.existsSync(candidate));

  if (!entrypoint) {
    throw new Error(`Unable to find generated client entrypoint for provider "${provider}" in ${outputDir}`);
  }

  const loadedModule = require(entrypoint);
  const PrismaClient =
    loadedModule.PrismaClient ??
    loadedModule.default?.PrismaClient ??
    loadedModule.default;

  if (typeof PrismaClient !== 'function') {
    throw new Error(`Generated client for provider "${provider}" does not export a PrismaClient constructor`);
  }

  const resolved = { PrismaClient };
  prismaClientModuleCache.set(provider, resolved);
  return resolved;
}

function createPrismaClient(provider: IntegrationProvider) {
  const adapter = new PrismaBetterSqlite3({ url: DB_URL });
  const { PrismaClient } = loadPrismaClientModule(provider);
  return new PrismaClient({ adapter } as any);
}

export function generateIntegrationClients() {
  cleanGeneratedClients();
  runPrisma(`node_modules/.bin/prisma generate --schema="${SCHEMA_PATH}"`);
  compilePrismaClientRuntime();
}

export function pushIntegrationSchema() {
  runPrisma(
    `node_modules/.bin/prisma db push --schema="${SCHEMA_PATH}" --url="${DB_URL}" --accept-data-loss`
  );
}

export function createRawClient(provider: IntegrationProvider) {
  return createPrismaClient(provider);
}

export function createTestClient(provider: IntegrationProvider) {
  const prisma = createPrismaClient(provider);
  return prisma.$extends(
    createSoftDeleteExtension({
      models: {
        User: true,
        Profile: true,
        Post: true,
        Comment: true,
        Membership: true,
      },
    })
  );
}

export async function resetDatabase(client: any) {
  await client.$executeRawUnsafe('DELETE FROM "Comment"');
  await client.$executeRawUnsafe('DELETE FROM "Post"');
  await client.$executeRawUnsafe('DELETE FROM "User"');
  await client.$executeRawUnsafe('DELETE FROM "Profile"');
  await client.$executeRawUnsafe('DELETE FROM "Tag"');
  await client.$executeRawUnsafe('DELETE FROM "Membership"');
}
