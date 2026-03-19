import { Prisma } from '@prisma/client';
import { resolveConfig } from './config';
import type { SoftDeleteConfig } from './types';

export function createSoftDeleteExtension(config: SoftDeleteConfig) {
  const models = resolveConfig(config);

  return Prisma.defineExtension((client) => {
    function handleFindWithSoftDelete(
      model: string,
      args: any,
      query: (args: any) => Promise<any>,
      cfg: ReturnType<typeof models.get>
    ): Promise<any> {
      const extArgs = args as typeof args & { includeSoftDeleted?: boolean };
      const { includeSoftDeleted, ...rest } = extArgs;
      if (!cfg || includeSoftDeleted) return query(rest as typeof args);
      return query({
        ...rest,
        where: { ...rest.where, [cfg.field]: null },
      } as typeof args);
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
          async findFirst({ model, args, query }: { model: string; args: any; query: (args: any) => Promise<any> }) {
            return handleFindWithSoftDelete(model, args, query, models.get(model));
          },
          async findFirstOrThrow({ model, args, query }: { model: string; args: any; query: (args: any) => Promise<any> }) {
            return handleFindWithSoftDelete(model, args, query, models.get(model));
          },
          async findMany({ model, args, query }: { model: string; args: any; query: (args: any) => Promise<any> }) {
            return handleFindWithSoftDelete(model, args, query, models.get(model));
          },
          async findUnique({ model, args, query }: { model: string; args: any; query: (args: any) => Promise<any> }) {
            const cfg = models.get(model);
            if (!cfg) return query(args);
            const extArgs = args as typeof args & { includeSoftDeleted?: boolean };
            const { includeSoftDeleted, ...rest } = extArgs;
            const anyClient = client as any;
            const modelName = model.charAt(0).toLowerCase() + model.slice(1);
            if (includeSoftDeleted) {
              return anyClient[modelName].findFirst({ ...rest });
            }
            return anyClient[modelName].findFirst({
              ...rest,
              where: { ...rest.where, [cfg.field]: null },
            });
          },
          async findUniqueOrThrow({ model, args, query }: { model: string; args: any; query: (args: any) => Promise<any> }) {
            const cfg = models.get(model);
            if (!cfg) return query(args);
            const extArgs = args as typeof args & { includeSoftDeleted?: boolean };
            const { includeSoftDeleted, ...rest } = extArgs;
            const anyClient = client as any;
            const modelName = model.charAt(0).toLowerCase() + model.slice(1);
            const result = await anyClient[modelName].findFirst(
              includeSoftDeleted
                ? { ...rest }
                : { ...rest, where: { ...rest.where, [cfg.field]: null } }
            );
            if (result === null) {
              throw new Prisma.PrismaClientKnownRequestError(
                'An operation failed because it depends on one or more records that were required but not found.',
                {
                  code: 'P2025',
                  clientVersion: Prisma.prismaVersion.client,
                  meta: { cause: 'Record to find not found.' },
                }
              );
            }
            return result;
          },
        },
      },
    });
  });
}
