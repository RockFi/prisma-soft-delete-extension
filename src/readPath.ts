import type { ModelMetadata, ResolvedModels } from './metadata';
import {
  addActiveFilter,
  expandCompoundUniqueWhere,
  hasOwn,
  hasScopedFieldPredicate,
  isObject,
} from './metadata';

interface ReadRelationNode {
  model: string;
  isList: boolean;
  stripDeletedField: boolean;
  child: ReadResultNode;
}

export interface ReadResultNode {
  relations: Record<string, ReadRelationNode>;
}

interface NormalizeReadResult {
  args: any;
  node: ReadResultNode;
}

function emptyNode(): ReadResultNode {
  return { relations: {} };
}

function rewriteLogicalValue(
  model: string,
  value: unknown,
  metadata: Record<string, ModelMetadata>,
  models: ResolvedModels,
  applyRootFilter: boolean
): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) =>
      isObject(entry) ? rewriteWhere(model, entry, metadata, models, applyRootFilter) : entry
    );
  }

  if (isObject(value)) {
    return rewriteWhere(model, value, metadata, models, applyRootFilter);
  }

  return value;
}

function rewriteListRelationFilter(
  targetModel: string,
  value: Record<string, any>,
  metadata: Record<string, ModelMetadata>,
  models: ResolvedModels
): Record<string, any> {
  const next: Record<string, any> = { ...value };

  for (const modifier of ['some', 'none', 'every'] as const) {
    if (!isObject(value[modifier])) continue;

    if (modifier === 'every') {
      const rewritten = rewriteWhere(targetModel, value[modifier], metadata, models, false);
      const cfg = models.get(targetModel);

      next[modifier] =
        cfg && !hasScopedFieldPredicate(targetModel, value[modifier], metadata, cfg.field)
          ? {
              OR: [{ [cfg.field]: { not: null } }, rewritten],
            }
          : rewritten;
      continue;
    }

    next[modifier] = rewriteWhere(targetModel, value[modifier], metadata, models, true);
  }

  return next;
}

function rewriteToOneRelationFilter(
  targetModel: string,
  value: Record<string, any>,
  metadata: Record<string, ModelMetadata>,
  models: ResolvedModels
): Record<string, any> {
  const next: Record<string, any> = { ...value };
  let handledModifier = false;

  if (isObject(value.is)) {
    next.is = rewriteWhere(targetModel, value.is, metadata, models, true);
    handledModifier = true;
  }

  if (isObject(value.isNot)) {
    next.isNot = rewriteWhere(targetModel, value.isNot, metadata, models, true);
    handledModifier = true;
  }

  if (!handledModifier) {
    return rewriteWhere(targetModel, value, metadata, models, true);
  }

  return next;
}

function rewriteWhere(
  model: string,
  where: Record<string, any>,
  metadata: Record<string, ModelMetadata>,
  models: ResolvedModels,
  applyRootFilter: boolean
): Record<string, any> {
  const next: Record<string, any> = {};
  const relations = metadata[model]?.relations ?? {};
  const cfg = models.get(model);
  const shouldApplyCurrentModelFilter =
    applyRootFilter && !(cfg && hasScopedFieldPredicate(model, where, metadata, cfg.field));

  for (const [key, value] of Object.entries(where)) {
    if (key === 'AND' || key === 'OR' || key === 'NOT') {
      next[key] = rewriteLogicalValue(model, value, metadata, models, shouldApplyCurrentModelFilter);
      continue;
    }

    const relation = relations[key];
    if (relation && isObject(value)) {
      next[key] = relation.isList
        ? rewriteListRelationFilter(relation.targetModel, value, metadata, models)
        : rewriteToOneRelationFilter(relation.targetModel, value, metadata, models);
      continue;
    }

    next[key] = value;
  }

  return shouldApplyCurrentModelFilter ? addActiveFilter(model, next, metadata, models) : next;
}

function rewriteSelectionSet(
  model: string,
  selection: Record<string, any>,
  metadata: Record<string, ModelMetadata>,
  models: ResolvedModels
): { value: Record<string, any>; node: ReadResultNode } {
  const next: Record<string, any> = { ...selection };
  const node = emptyNode();
  const relations = metadata[model]?.relations ?? {};

  for (const [fieldName, fieldValue] of Object.entries(selection)) {
    const relation = relations[fieldName];
    if (!relation) continue;

    let childNode = emptyNode();
    let stripDeletedField = false;

    if (fieldValue === true) {
      if (relation.isList && models.has(relation.targetModel)) {
        next[fieldName] = {
          where: rewriteWhere(relation.targetModel, {}, metadata, models, true),
        };
      }

      node.relations[fieldName] = {
        model: relation.targetModel,
        isList: relation.isList,
        stripDeletedField: false,
        child: childNode,
      };
      continue;
    }

    if (!isObject(fieldValue)) {
      continue;
    }

    const relationArgs: Record<string, any> = { ...fieldValue };

    if (relation.isList) {
      relationArgs.where = rewriteWhere(
        relation.targetModel,
        isObject(relationArgs.where) ? relationArgs.where : {},
        metadata,
        models,
        true
      );
    } else {
      const cfg = models.get(relation.targetModel);
      if (cfg && isObject(relationArgs.select) && !hasOwn(relationArgs.select, cfg.field)) {
        relationArgs.select = {
          ...relationArgs.select,
          [cfg.field]: true,
        };
        stripDeletedField = true;
      }
    }

    if (isObject(relationArgs.include)) {
      const rewritten = rewriteSelectionSet(relation.targetModel, relationArgs.include, metadata, models);
      relationArgs.include = rewritten.value;
      childNode = rewritten.node;
    }

    if (isObject(relationArgs.select)) {
      const rewritten = rewriteSelectionSet(relation.targetModel, relationArgs.select, metadata, models);
      relationArgs.select = rewritten.value;
      childNode = rewritten.node;
    }

    next[fieldName] = relationArgs;
    node.relations[fieldName] = {
      model: relation.targetModel,
      isList: relation.isList,
      stripDeletedField,
      child: childNode,
    };
  }

  return { value: next, node };
}

export function normalizeReadArgs(
  model: string,
  args: any,
  metadata: Record<string, ModelMetadata>,
  models: ResolvedModels
): NormalizeReadResult {
  const nextArgs = { ...(args ?? {}) };
  const node = emptyNode();

  nextArgs.where = rewriteWhere(
    model,
    expandCompoundUniqueWhere(model, isObject(nextArgs.where) ? nextArgs.where : {}, metadata),
    metadata,
    models,
    true
  );

  if (isObject(nextArgs.include)) {
    const rewritten = rewriteSelectionSet(model, nextArgs.include, metadata, models);
    nextArgs.include = rewritten.value;
    Object.assign(node.relations, rewritten.node.relations);
  }

  if (isObject(nextArgs.select)) {
    const rewritten = rewriteSelectionSet(model, nextArgs.select, metadata, models);
    nextArgs.select = rewritten.value;
    Object.assign(node.relations, rewritten.node.relations);
  }

  return { args: nextArgs, node };
}

export function normalizeFilterOnlyReadArgs(
  model: string,
  args: any,
  metadata: Record<string, ModelMetadata>,
  models: ResolvedModels
): any {
  const nextArgs = { ...(args ?? {}) };

  nextArgs.where = rewriteWhere(
    model,
    expandCompoundUniqueWhere(model, isObject(nextArgs.where) ? nextArgs.where : {}, metadata),
    metadata,
    models,
    true
  );

  return nextArgs;
}

function processRelationValue(relationNode: ReadRelationNode, value: any, models: ResolvedModels): any {
  if (value == null) {
    return value;
  }

  if (relationNode.isList) {
    if (!Array.isArray(value)) {
      return value;
    }

    return value.map((entry) => postProcessReadResult(entry, relationNode.child, models));
  }

  const cfg = models.get(relationNode.model);
  if (cfg && isObject(value) && value[cfg.field] != null) {
    return null;
  }

  const processed = postProcessReadResult(value, relationNode.child, models);

  if (relationNode.stripDeletedField && cfg && isObject(processed) && hasOwn(processed, cfg.field)) {
    const { [cfg.field]: _removed, ...rest } = processed;
    return rest;
  }

  return processed;
}

export function postProcessReadResult(result: any, node: ReadResultNode, models: ResolvedModels): any {
  if (result == null) {
    return result;
  }

  if (Array.isArray(result)) {
    return result.map((entry) => postProcessReadResult(entry, node, models));
  }

  if (!isObject(result) || Object.keys(node.relations).length === 0) {
    return result;
  }

  const next = { ...result };

  for (const [relationName, relationNode] of Object.entries(node.relations)) {
    if (!(relationName in next)) continue;

    next[relationName] = processRelationValue(relationNode, next[relationName], models);
  }

  return next;
}
