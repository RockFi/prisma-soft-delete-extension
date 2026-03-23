import type { ResolvedModelConfig } from './types';
import type { ModelMetadata } from './readPath';

type ResolvedModels = Map<string, ResolvedModelConfig>;

function isObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(value: Record<string, any>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function addActiveFilter(model: string, where: Record<string, any>, models: ResolvedModels): Record<string, any> {
  const cfg = models.get(model);
  if (!cfg || hasOwn(where, cfg.field)) {
    return where;
  }

  return {
    ...where,
    [cfg.field]: null,
  };
}

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

function normalizeUpdateManyEnvelope(
  targetModel: string,
  value: Record<string, any>,
  models: ResolvedModels
): Record<string, any> {
  return {
    ...value,
    where: addActiveFilter(targetModel, isObject(value.where) ? value.where : {}, models),
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

    if (relation.isList) {
      if (relationPayload.updateMany !== undefined) {
        relationPayload.updateMany = mapOperationEntries(relationPayload.updateMany, (entry) =>
          normalizeUpdateManyEnvelope(relation.targetModel, entry, models)
        );
      }

      if (relationPayload.update !== undefined) {
        relationPayload.update = mapOperationEntries(relationPayload.update, (entry) =>
          isObject(entry.data)
            ? {
                ...entry,
                data: normalizeNestedData(relation.targetModel, entry.data, metadata, models, relation.targetModel),
              }
            : entry
        );
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

    if (models.has(relation.targetModel) && relationPayload.update !== undefined) {
      throwToOneWriteError('update', relation.targetModel, relationPath);
    }

    if (models.has(relation.targetModel) && relationPayload.upsert !== undefined) {
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

export function normalizeRootUpdateManyArgs(
  model: string,
  args: any,
  models: ResolvedModels
): any {
  if (!isObject(args)) {
    return args;
  }

  return {
    ...args,
    where: addActiveFilter(model, isObject(args.where) ? args.where : {}, models),
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
