import { Prisma } from '@prisma/client';
import { resolveConfig } from './config';
import type { SoftDeleteConfig } from './types';
import {
  buildModelMetadata,
  normalizeFilterOnlyReadArgs,
  normalizeReadArgs,
  postProcessReadResult,
} from './readPath';
import { normalizeRootUpdateManyArgs, normalizeWriteArgs } from './writePath';

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

      const anyClient = client as any;
      const modelName = model.charAt(0).toLowerCase() + model.slice(1);
      const result = await anyClient[modelName][orThrow ? 'findFirstOrThrow' : 'findFirst'](
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
      query: {
        $allModels: {
          async delete({ model, args, query }: { model: string; args: any; query: (args: any) => Promise<any> }) {
            const cfg = models.get(model);
            if (!cfg) return query(args);
            const anyClient = client as any;
            return anyClient[model.charAt(0).toLowerCase() + model.slice(1)].update({
              where: args.where,
              data: { [cfg.field]: new Date() },
            });
          },
          async deleteMany({ model, args, query }: { model: string; args: any; query: (args: any) => Promise<any> }) {
            const cfg = models.get(model);
            if (!cfg) return query(args);
            const anyClient = client as any;
            return anyClient[model.charAt(0).toLowerCase() + model.slice(1)].updateMany({
              where: args.where,
              data: { [cfg.field]: new Date() },
            });
          },
          async update({ model, args, query }: { model: string; args: any; query: (args: any) => Promise<any> }) {
            return query(normalizeWriteArgs(model, args, metadata, models));
          },
          async updateMany({ model, args, query }: { model: string; args: any; query: (args: any) => Promise<any> }) {
            return query(normalizeRootUpdateManyArgs(model, args, models));
          },
          async upsert({ model, args, query }: { model: string; args: any; query: (args: any) => Promise<any> }) {
            return query(normalizeWriteArgs(model, args, metadata, models));
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
