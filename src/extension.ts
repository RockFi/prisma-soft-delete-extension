import { Prisma } from '@prisma/client';
import { resolveConfig } from './config';
import { createLifecycleMethods } from './lifecycle';
import { buildModelMetadata, getModelDelegate } from './metadata';
import type { SoftDeleteConfig } from './types';
import {
  normalizeFilterOnlyReadArgs,
  normalizeReadArgs,
  postProcessReadResult,
} from './readPath';
import {
  assertNestedUpsertTargetsActiveOrAbsent,
  assertRootUpsertTargetActiveOrAbsent,
  normalizeRootUpdateArgs,
  normalizeRootUpdateManyArgs,
  normalizeWriteArgs,
} from './writePath';

export function createSoftDeleteExtension(config: SoftDeleteConfig) {
  const models = resolveConfig(config);

  return Prisma.defineExtension((client) => {
    const metadata = buildModelMetadata(client);

    async function handleRead(
      model: string,
      args: any,
      query: (args: any) => Promise<any>
    ): Promise<any> {
      const extArgs = ((args ?? {}) as typeof args & { includeSoftDeleted?: boolean });
      const { includeSoftDeleted, ...rest } = extArgs;
      if (includeSoftDeleted) {
        return query(rest as typeof args);
      }

      const normalized = normalizeReadArgs(model, rest, metadata, models);
      const result = await query(normalized.args as typeof args);
      return postProcessReadResult(result, normalized.node, models);
    }

    async function handleUniqueRead(
      model: string,
      args: any,
      query: (args: any) => Promise<any>,
      orThrow: boolean
    ): Promise<any> {
      const extArgs = ((args ?? {}) as typeof args & { includeSoftDeleted?: boolean });
      const { includeSoftDeleted, ...rest } = extArgs;
      if (includeSoftDeleted) {
        return query(rest as typeof args);
      }

      const normalized = normalizeReadArgs(model, rest, metadata, models);
      const cfg = models.get(model);

      if (!cfg) {
        const result = await query(normalized.args as typeof args);
        return postProcessReadResult(result, normalized.node, models);
      }

      const delegate = getModelDelegate(client, model);
      const result = await delegate[orThrow ? 'findFirstOrThrow' : 'findFirst'](
        normalized.args
      );
      return postProcessReadResult(result, normalized.node, models);
    }

    async function handleFilterOnlyRead(
      model: string,
      args: any,
      query: (args: any) => Promise<any>
    ): Promise<any> {
      const extArgs = ((args ?? {}) as typeof args & { includeSoftDeleted?: boolean });
      const { includeSoftDeleted, ...rest } = extArgs;
      if (includeSoftDeleted) {
        return query(rest as typeof args);
      }

      return query(normalizeFilterOnlyReadArgs(model, rest, metadata, models) as typeof args);
    }

    return client.$extends({
      model: {
        $allModels: createLifecycleMethods(client, metadata, models),
      },
      query: {
        $allModels: {
          async delete({ model, args, query }: { model: string; args: any; query: (args: any) => Promise<any> }) {
            const cfg = models.get(model);
            if (!cfg) return query(args);
            return getModelDelegate(client, model).update({
              where: args.where,
              data: { [cfg.field]: new Date() },
            });
          },
          async deleteMany({ model, args, query }: { model: string; args: any; query: (args: any) => Promise<any> }) {
            const cfg = models.get(model);
            if (!cfg) return query(args);
            return getModelDelegate(client, model).updateMany({
              where: args.where,
              data: { [cfg.field]: new Date() },
            });
          },
          async update({ model, args, query }: { model: string; args: any; query: (args: any) => Promise<any> }) {
            const normalizedRoot = normalizeRootUpdateArgs(model, args, metadata, models);
            const normalizedArgs = normalizeWriteArgs(model, normalizedRoot, metadata, models);
            await assertNestedUpsertTargetsActiveOrAbsent(model, normalizedArgs, client, metadata, models);
            return query(normalizedArgs);
          },
          async updateMany({ model, args, query }: { model: string; args: any; query: (args: any) => Promise<any> }) {
            return query(normalizeRootUpdateManyArgs(model, args, metadata, models));
          },
          async upsert({ model, args, query }: { model: string; args: any; query: (args: any) => Promise<any> }) {
            await assertRootUpsertTargetActiveOrAbsent(model, args, client, metadata, models);
            const normalizedArgs = normalizeWriteArgs(model, args, metadata, models);
            await assertNestedUpsertTargetsActiveOrAbsent(model, normalizedArgs, client, metadata, models);
            return query(normalizedArgs);
          },
          async findFirst({ model, args, query }: { model: string; args: any; query: (args: any) => Promise<any> }) {
            return handleRead(model, args, query);
          },
          async findFirstOrThrow({ model, args, query }: { model: string; args: any; query: (args: any) => Promise<any> }) {
            return handleRead(model, args, query);
          },
          async findMany({ model, args, query }: { model: string; args: any; query: (args: any) => Promise<any> }) {
            return handleRead(model, args, query);
          },
          async findUnique({ model, args, query }: { model: string; args: any; query: (args: any) => Promise<any> }) {
            return handleUniqueRead(model, args, query, false);
          },
          async findUniqueOrThrow({ model, args, query }: { model: string; args: any; query: (args: any) => Promise<any> }) {
            return handleUniqueRead(model, args, query, true);
          },
          async count({ model, args, query }: { model: string; args: any; query: (args: any) => Promise<any> }) {
            return handleFilterOnlyRead(model, args, query);
          },
          async aggregate({ model, args, query }: { model: string; args: any; query: (args: any) => Promise<any> }) {
            return handleFilterOnlyRead(model, args, query);
          },
          async groupBy({ model, args, query }: { model: string; args: any; query: (args: any) => Promise<any> }) {
            return handleFilterOnlyRead(model, args, query);
          },
        },
      },
    });
  });
}
