import { PrismaClient } from '../integration/generated/prisma-client-js';
import {
  createSoftDeleteExtension,
  defineSoftDeleteConfig,
  withSoftDeleteTypes,
  type SoftDeleteConfig,
} from '../../src';

const helperConfig = defineSoftDeleteConfig({
  models: {
    User: true,
    Post: { field: 'archivedAt' },
    Comment: { field: 'removedAt' },
  },
});

const helperPrisma = withSoftDeleteTypes(
  new PrismaClient().$extends(createSoftDeleteExtension(helperConfig)),
  helperConfig
);

void helperPrisma.user.findMany({ includeSoftDeleted: true });
void helperPrisma.post.count({ includeSoftDeleted: true });
void helperPrisma.comment.groupBy({ by: ['content'], includeSoftDeleted: true });

// @ts-expect-error Tag is not configured for soft delete.
void helperPrisma.tag.findMany({ includeSoftDeleted: true });

const satisfiesConfig = {
  models: {
    User: true,
    Membership: true,
  },
} satisfies SoftDeleteConfig;

const satisfiesPrisma = withSoftDeleteTypes(
  new PrismaClient().$extends(createSoftDeleteExtension(satisfiesConfig)),
  satisfiesConfig
);

void satisfiesPrisma.user.findUnique({ where: { id: 1 }, includeSoftDeleted: true });
void satisfiesPrisma.membership.findUnique({
  where: {
    workspaceId_externalId: {
      workspaceId: 1,
      externalId: 'ext-1',
    },
  },
  includeSoftDeleted: true,
});

// @ts-expect-error Tag is not configured for soft delete.
void satisfiesPrisma.tag.count({ includeSoftDeleted: true });

const broadPrisma = withSoftDeleteTypes(
  new PrismaClient().$extends(createSoftDeleteExtension(helperConfig))
);

void broadPrisma.tag.findMany({ includeSoftDeleted: true });
