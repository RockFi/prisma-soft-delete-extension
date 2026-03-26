import type { ModelMetadata, ResolvedModels } from './metadata';
import {
  addActiveFilter,
  constrainToDeleted,
  expandCompoundUniqueWhere,
  getConfiguredModelOrThrow,
  getModelDelegate,
  isObject,
} from './metadata';

function mapOperationEntries(value: unknown, mapper: (entry: Record<string, any>) => Record<string, any>): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => (isObject(entry) ? mapper(entry) : entry));
  }

  if (isObject(value)) {
    return mapper(value);
  }

  return value;
}

function throwToOneWriteError(operation: 'update' | 'upsert', targetModel: string, path: string): never {
  const action = operation === 'update' ? 'update' : 'upsert';
  const summary = operation === 'update' ? 'Updates' : 'Upserts';

  throw new Error(
    `prisma-soft-delete-extension: ${action} of model "${targetModel}" through "${path}" found. ${summary} of soft deleted models through a toOne relation is not supported as it is possible to update a soft deleted record.`
  );
}

function throwDeletedUpsertError(targetModel: string, path?: string): never {
  const location = path ? ` through "${path}"` : '';

  throw new Error(
    `prisma-soft-delete-extension: upsert of model "${targetModel}"${location} found a soft deleted record. Restore it with "restore()" or permanently remove it with "hardDelete()" before calling upsert().`
  );
}

function throwNestedDeleteError(
  operation: 'delete' | 'deleteMany',
  targetModel: string,
  path: string
): never {
  throw new Error(
    `prisma-soft-delete-extension: ${operation} of model "${targetModel}" through "${path}" found. Nested hard deletes for configured soft-delete models are not supported because they bypass soft delete and permanently remove rows.`
  );
}

function normalizeUpdateEnvelope(
  targetModel: string,
  value: Record<string, any>,
  metadata: Record<string, ModelMetadata>,
  models: ResolvedModels
): Record<string, any> {
  return {
    ...value,
    where: addActiveFilter(
      targetModel,
      expandCompoundUniqueWhere(targetModel, isObject(value.where) ? value.where : {}, metadata),
      metadata,
      models
    ),
  };
}

function normalizeNestedData(
  model: string,
  data: Record<string, any>,
  metadata: Record<string, ModelMetadata>,
  models: ResolvedModels,
  path: string
): Record<string, any> {
  const next = { ...data };
  const relations = metadata[model]?.relations ?? {};

  for (const [fieldName, fieldValue] of Object.entries(data)) {
    const relation = relations[fieldName];
    if (!relation || !isObject(fieldValue)) {
      continue;
    }

    const relationPath = `${path}.${fieldName}`;
    const relationPayload: Record<string, any> = { ...fieldValue };
    const targetIsSoftDeleted = models.has(relation.targetModel);

    if (targetIsSoftDeleted && relationPayload.delete !== undefined) {
      throwNestedDeleteError('delete', relation.targetModel, relationPath);
    }

    if (targetIsSoftDeleted && relationPayload.deleteMany !== undefined) {
      throwNestedDeleteError('deleteMany', relation.targetModel, relationPath);
    }

    if (relation.isList) {
      if (relationPayload.updateMany !== undefined) {
        relationPayload.updateMany = mapOperationEntries(relationPayload.updateMany, (entry) =>
          normalizeUpdateEnvelope(relation.targetModel, entry, metadata, models)
        );
      }

      if (relationPayload.update !== undefined) {
        relationPayload.update = mapOperationEntries(relationPayload.update, (entry) => ({
          ...entry,
          where: addActiveFilter(
            relation.targetModel,
            expandCompoundUniqueWhere(relation.targetModel, isObject(entry.where) ? entry.where : {}, metadata),
            metadata,
            models
          ),
          data: isObject(entry.data)
            ? normalizeNestedData(relation.targetModel, entry.data, metadata, models, relation.targetModel)
            : entry.data,
        }));
      }

      if (relationPayload.upsert !== undefined) {
        relationPayload.upsert = mapOperationEntries(relationPayload.upsert, (entry) => ({
          ...entry,
          update: isObject(entry.update)
            ? normalizeNestedData(relation.targetModel, entry.update, metadata, models, relation.targetModel)
            : entry.update,
          create: isObject(entry.create)
            ? normalizeNestedData(relation.targetModel, entry.create, metadata, models, relation.targetModel)
            : entry.create,
        }));
      }

      if (relationPayload.create !== undefined) {
        relationPayload.create = mapOperationEntries(relationPayload.create, (entry) =>
          normalizeNestedData(relation.targetModel, entry, metadata, models, relation.targetModel)
        );
      }

      if (relationPayload.connectOrCreate !== undefined) {
        relationPayload.connectOrCreate = mapOperationEntries(relationPayload.connectOrCreate, (entry) => ({
          ...entry,
          create: isObject(entry.create)
            ? normalizeNestedData(relation.targetModel, entry.create, metadata, models, relation.targetModel)
            : entry.create,
        }));
      }

      next[fieldName] = relationPayload;
      continue;
    }

    if (targetIsSoftDeleted && relationPayload.update !== undefined) {
      throwToOneWriteError('update', relation.targetModel, relationPath);
    }

    if (targetIsSoftDeleted && relationPayload.upsert !== undefined) {
      throwToOneWriteError('upsert', relation.targetModel, relationPath);
    }

    if (isObject(relationPayload.update)) {
      relationPayload.update = normalizeNestedData(
        relation.targetModel,
        relationPayload.update,
        metadata,
        models,
        relation.targetModel
      );
    }

    if (isObject(relationPayload.create)) {
      relationPayload.create = normalizeNestedData(
        relation.targetModel,
        relationPayload.create,
        metadata,
        models,
        relation.targetModel
      );
    }

    if (isObject(relationPayload.connectOrCreate?.create)) {
      relationPayload.connectOrCreate = {
        ...relationPayload.connectOrCreate,
        create: normalizeNestedData(
          relation.targetModel,
          relationPayload.connectOrCreate.create,
          metadata,
          models,
          relation.targetModel
        ),
      };
    }

    next[fieldName] = relationPayload;
  }

  return next;
}

async function hasDeletedTarget(
  model: string,
  where: Record<string, any>,
  baseClient: any,
  metadata: Record<string, ModelMetadata>,
  models: ResolvedModels
): Promise<boolean> {
  const cfg = getConfiguredModelOrThrow(model, models, 'Soft-delete lifecycle');
  const delegate = getModelDelegate(baseClient, model);
  const deletedRow = await delegate.findFirst({
    where: constrainToDeleted(model, expandCompoundUniqueWhere(model, where, metadata), models),
    select: {
      [cfg.field]: true,
    },
  });

  return deletedRow != null;
}

async function assertNestedUpsertTargetsAllowed(
  model: string,
  data: Record<string, any>,
  baseClient: any,
  metadata: Record<string, ModelMetadata>,
  models: ResolvedModels,
  path: string
): Promise<void> {
  const relations = metadata[model]?.relations ?? {};

  for (const [fieldName, fieldValue] of Object.entries(data)) {
    const relation = relations[fieldName];
    if (!relation || !isObject(fieldValue)) {
      continue;
    }

    const relationPath = `${path}.${fieldName}`;
    const relationPayload = fieldValue as Record<string, any>;

    if (relation.isList && relationPayload.upsert !== undefined && models.has(relation.targetModel)) {
      const entries = Array.isArray(relationPayload.upsert) ? relationPayload.upsert : [relationPayload.upsert];

      for (const entry of entries) {
        if (!isObject(entry)) continue;
        if (await hasDeletedTarget(relation.targetModel, isObject(entry.where) ? entry.where : {}, baseClient, metadata, models)) {
          throwDeletedUpsertError(relation.targetModel, relationPath);
        }
      }
    }

    if (relation.isList) {
      for (const key of ['update', 'upsert', 'create', 'connectOrCreate'] as const) {
        const value = relationPayload[key];
        const entries = Array.isArray(value) ? value : value === undefined ? [] : [value];

        for (const entry of entries) {
          if (!isObject(entry)) continue;
          if (isObject(entry.data)) {
            await assertNestedUpsertTargetsAllowed(relation.targetModel, entry.data, baseClient, metadata, models, relation.targetModel);
          }
          if (isObject(entry.update)) {
            await assertNestedUpsertTargetsAllowed(relation.targetModel, entry.update, baseClient, metadata, models, relation.targetModel);
          }
          if (isObject(entry.create)) {
            await assertNestedUpsertTargetsAllowed(relation.targetModel, entry.create, baseClient, metadata, models, relation.targetModel);
          }
        }
      }

      continue;
    }

    for (const nested of [relationPayload.update, relationPayload.create, relationPayload.connectOrCreate?.create]) {
      if (isObject(nested)) {
        await assertNestedUpsertTargetsAllowed(relation.targetModel, nested, baseClient, metadata, models, relation.targetModel);
      }
    }
  }
}

export function normalizeRootUpdateArgs(
  model: string,
  args: any,
  metadata: Record<string, ModelMetadata>,
  models: ResolvedModels
): any {
  if (!isObject(args)) {
    return args;
  }

  return {
    ...args,
    where: addActiveFilter(
      model,
      expandCompoundUniqueWhere(model, isObject(args.where) ? args.where : {}, metadata),
      metadata,
      models
    ),
  };
}

export function normalizeRootUpdateManyArgs(
  model: string,
  args: any,
  metadata: Record<string, ModelMetadata>,
  models: ResolvedModels
): any {
  if (!isObject(args)) {
    return args;
  }

  return {
    ...args,
    where: addActiveFilter(
      model,
      expandCompoundUniqueWhere(model, isObject(args.where) ? args.where : {}, metadata),
      metadata,
      models
    ),
  };
}

export function normalizeWriteArgs(
  model: string,
  args: any,
  metadata: Record<string, ModelMetadata>,
  models: ResolvedModels
): any {
  if (!isObject(args) || !isObject(args.data)) {
    return args;
  }

  return {
    ...args,
    data: normalizeNestedData(model, args.data, metadata, models, model),
  };
}

export async function assertRootUpsertTargetActiveOrAbsent(
  model: string,
  args: any,
  baseClient: any,
  metadata: Record<string, ModelMetadata>,
  models: ResolvedModels
): Promise<void> {
  if (!models.has(model) || !isObject(args?.where)) {
    return;
  }

  if (await hasDeletedTarget(model, args.where, baseClient, metadata, models)) {
    throwDeletedUpsertError(model);
  }
}

export async function assertNestedUpsertTargetsActiveOrAbsent(
  model: string,
  args: any,
  baseClient: any,
  metadata: Record<string, ModelMetadata>,
  models: ResolvedModels
): Promise<void> {
  if (!isObject(args?.data)) {
    return;
  }

  await assertNestedUpsertTargetsAllowed(model, args.data, baseClient, metadata, models, model);
}
