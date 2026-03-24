import { Prisma } from '@prisma/client';
import type { ModelMetadata, ResolvedModels } from './metadata';
import {
  constrainToDeleted,
  expandCompoundUniqueWhere,
  getConfiguredModelOrThrow,
  getModelDelegate,
  isObject,
} from './metadata';

type RestoreArgs<T> = Omit<Prisma.Args<T, 'update'>, 'data'>;
type RestoreManyArgs<T> = Omit<Prisma.Args<T, 'updateMany'>, 'data'>;
type RestoreResult<T, A> = Prisma.Result<T, A & { data: Record<string, never> }, 'update'>;
type RestoreManyResult<T, A> = Prisma.Result<T, A & { data: Record<string, never> }, 'updateMany'>;
type HardDeleteArgs<T> = Prisma.Args<T, 'delete'>;
type HardDeleteManyArgs<T> = Prisma.Args<T, 'deleteMany'>;
type HardDeleteResult<T, A> = Prisma.Result<T, A, 'delete'>;
type HardDeleteManyResult<T, A> = Prisma.Result<T, A, 'deleteMany'>;

function getExtensionModelName(that: unknown): string {
  const context = Prisma.getExtensionContext(that as object) as { $name?: string; name?: string };
  const modelName = context?.$name ?? context?.name;

  if (!modelName) {
    throw new Error(
      'prisma-soft-delete-extension: Unable to resolve Prisma model context for lifecycle helper.'
    );
  }

  return modelName;
}

function toDeletedLookupWhere(
  model: string,
  where: unknown,
  metadata: Record<string, ModelMetadata>,
  models: ResolvedModels
) {
  return constrainToDeleted(
    model,
    expandCompoundUniqueWhere(model, isObject(where) ? where : {}, metadata),
    models
  );
}

export function createLifecycleMethods(
  baseClient: any,
  metadata: Record<string, ModelMetadata>,
  models: ResolvedModels
) {
  return {
    async restore<T, A extends RestoreArgs<T>>(
      this: T,
      args: Prisma.Exact<A, RestoreArgs<T>>
    ): Promise<RestoreResult<T, A>> {
      const model = getExtensionModelName(this);
      const cfg = getConfiguredModelOrThrow(model, models, 'restore()');
      const delegate = getModelDelegate(baseClient, model);
      const { where, ...rest } = (args ?? {}) as Record<string, any>;

      await delegate.findFirstOrThrow({
        where: toDeletedLookupWhere(model, where, metadata, models),
        select: { [cfg.field]: true },
      });

      return delegate.update({
        ...rest,
        where,
        data: { [cfg.field]: null },
      }) as Promise<RestoreResult<T, A>>;
    },

    async restoreMany<T, A extends RestoreManyArgs<T>>(
      this: T,
      args?: Prisma.Exact<A, RestoreManyArgs<T>>
    ): Promise<RestoreManyResult<T, A>> {
      const model = getExtensionModelName(this);
      const cfg = getConfiguredModelOrThrow(model, models, 'restoreMany()');
      const delegate = getModelDelegate(baseClient, model);
      const { where, ...rest } = ((args ?? {}) as Record<string, any>);

      return delegate.updateMany({
        ...rest,
        where: toDeletedLookupWhere(model, where, metadata, models),
        data: { [cfg.field]: null },
      }) as Promise<RestoreManyResult<T, A>>;
    },

    async hardDelete<T, A extends HardDeleteArgs<T>>(
      this: T,
      args: Prisma.Exact<A, HardDeleteArgs<T>>
    ): Promise<HardDeleteResult<T, A>> {
      const model = getExtensionModelName(this);
      getConfiguredModelOrThrow(model, models, 'hardDelete()');
      const delegate = getModelDelegate(baseClient, model);
      const { where } = (args ?? {}) as Record<string, any>;

      await delegate.findFirstOrThrow({
        where: toDeletedLookupWhere(model, where, metadata, models),
      });

      return delegate.delete(args as any) as Promise<HardDeleteResult<T, A>>;
    },

    async hardDeleteMany<T, A extends HardDeleteManyArgs<T>>(
      this: T,
      args?: Prisma.Exact<A, HardDeleteManyArgs<T>>
    ): Promise<HardDeleteManyResult<T, A>> {
      const model = getExtensionModelName(this);
      getConfiguredModelOrThrow(model, models, 'hardDeleteMany()');
      const delegate = getModelDelegate(baseClient, model);
      const { where, ...rest } = ((args ?? {}) as Record<string, any>);

      return delegate.deleteMany({
        ...rest,
        where: toDeletedLookupWhere(model, where, metadata, models),
      }) as Promise<HardDeleteManyResult<T, A>>;
    },
  };
}
