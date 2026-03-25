import type { ResolvedModelConfig } from './types';

export type ResolvedModels = Map<string, ResolvedModelConfig>;

interface RuntimeField {
  name: string;
  kind: string;
  type: string;
  isList?: boolean;
}

interface RuntimeModel {
  fields: RuntimeField[];
}

interface ParsedSchemaModel {
  fieldTypes: Record<string, string>;
  compoundUniqueFields: Record<string, string[]>;
}

export interface RelationMetadata {
  targetModel: string;
  isList: boolean;
}

export interface ModelMetadata {
  modelName: string;
  modelProperty: string;
  relations: Record<string, RelationMetadata>;
  compoundUniqueFields: Record<string, string[]>;
}

export function isObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function hasOwn(value: Record<string, any>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export function toModelProperty(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

function parseCompoundFields(line: string): { alias: string; fields: string[] } | null {
  const match = line.match(/^@@(?:unique|id)\s*\(\s*\[([^\]]+)\](?:\s*,\s*name:\s*"([^"]+)")?/);
  if (!match) {
    return null;
  }

  const fields = match[1]
    .split(',')
    .map((field) => field.trim().match(/^(\w+)/)?.[1] ?? '')
    .filter(Boolean);

  if (fields.length < 2) {
    return null;
  }

  return {
    alias: match[2] ?? fields.join('_'),
    fields,
  };
}

function parseSchemaModels(schema: string): Record<string, ParsedSchemaModel> {
  const models: Record<string, ParsedSchemaModel> = {};
  const modelPattern = /model\s+(\w+)\s+\{([\s\S]*?)\n\}/g;

  for (const match of schema.matchAll(modelPattern)) {
    const [, modelName, body] = match;
    const fieldTypes: Record<string, string> = {};
    const compoundUniqueFields: Record<string, string[]> = {};

    for (const rawLine of body.split('\n')) {
      const line = rawLine.split('//')[0].trim();
      if (!line) continue;

      if (line.startsWith('@@')) {
        const compound = parseCompoundFields(line);
        if (compound) {
          compoundUniqueFields[compound.alias] = compound.fields;
        }
        continue;
      }

      const fieldMatch = line.match(/^(\w+)\s+([^\s]+)/);
      if (!fieldMatch) continue;

      fieldTypes[fieldMatch[1]] = fieldMatch[2];
    }

    models[modelName] = {
      fieldTypes,
      compoundUniqueFields,
    };
  }

  return models;
}

export function buildModelMetadata(client: any): Record<string, ModelMetadata> {
  const runtimeDataModel = client?._runtimeDataModel ?? client?._engineConfig?.runtimeDataModel;
  const inlineSchema = client?._engineConfig?.inlineSchema;

  if (!runtimeDataModel?.models) {
    throw new Error(
      'prisma-soft-delete-extension: Prisma runtime data model is unavailable; relation traversal, write guards, and lifecycle helpers cannot be initialized.'
    );
  }

  if (typeof inlineSchema !== 'string') {
    throw new Error(
      'prisma-soft-delete-extension: Prisma inline schema is unavailable; relation list cardinality and compound unique aliases cannot be derived for nested filtering and lifecycle helpers.'
    );
  }

  const parsedSchemaModels = parseSchemaModels(inlineSchema);
  const metadata: Record<string, ModelMetadata> = {};

  for (const [modelName, runtimeModel] of Object.entries(runtimeDataModel.models as Record<string, RuntimeModel>)) {
    const relations: Record<string, RelationMetadata> = {};
    const parsedModel = parsedSchemaModels[modelName];

    for (const field of runtimeModel.fields) {
      if (field.kind !== 'object') continue;

      const typeToken = parsedModel?.fieldTypes[field.name];
      const isList =
        typeof field.isList === 'boolean' ? field.isList : typeof typeToken === 'string' ? typeToken.endsWith('[]') : null;

      if (isList == null) {
        throw new Error(
          `prisma-soft-delete-extension: Unable to resolve relation cardinality for ${modelName}.${field.name}; nested filtering and write guards cannot be initialized.`
        );
      }

      relations[field.name] = {
        targetModel: field.type,
        isList,
      };
    }

    metadata[modelName] = {
      modelName,
      modelProperty: toModelProperty(modelName),
      relations,
      compoundUniqueFields: parsedModel?.compoundUniqueFields ?? {},
    };
  }

  return metadata;
}

export function expandCompoundUniqueWhere(
  model: string,
  where: Record<string, any>,
  metadata: Record<string, ModelMetadata>
): Record<string, any> {
  const next: Record<string, any> = { ...where };
  const compoundUniqueFields = metadata[model]?.compoundUniqueFields ?? {};

  for (const [alias, fields] of Object.entries(compoundUniqueFields)) {
    if (!isObject(next[alias])) continue;

    const compoundValue = next[alias];
    delete next[alias];

    for (const field of fields) {
      if (hasOwn(compoundValue, field) && !hasOwn(next, field)) {
        next[field] = compoundValue[field];
      }
    }
  }

  return next;
}

export function hasScopedFieldPredicate(
  model: string,
  where: Record<string, any>,
  metadata: Record<string, ModelMetadata>,
  field: string
): boolean {
  if (hasOwn(where, field)) {
    return true;
  }

  const relations = metadata[model]?.relations ?? {};

  for (const [key, value] of Object.entries(where)) {
    if (key !== 'AND' && key !== 'OR' && key !== 'NOT') {
      if (relations[key]) {
        continue;
      }
      continue;
    }

    if (Array.isArray(value)) {
      if (value.some((entry) => isObject(entry) && hasScopedFieldPredicate(model, entry, metadata, field))) {
        return true;
      }
      continue;
    }

    if (isObject(value) && hasScopedFieldPredicate(model, value, metadata, field)) {
      return true;
    }
  }

  return false;
}

export function addActiveFilter(
  model: string,
  where: Record<string, any>,
  metadata: Record<string, ModelMetadata>,
  models: ResolvedModels
): Record<string, any> {
  const cfg = models.get(model);
  if (!cfg || hasScopedFieldPredicate(model, where, metadata, cfg.field)) {
    return where;
  }

  return {
    ...where,
    [cfg.field]: null,
  };
}

export function constrainToDeleted(
  model: string,
  where: Record<string, any>,
  models: ResolvedModels
): Record<string, any> {
  const cfg = models.get(model);
  if (!cfg) {
    return where;
  }

  if (Object.keys(where).length === 0) {
    return {
      [cfg.field]: { not: null },
    };
  }

  return {
    AND: [where, { [cfg.field]: { not: null } }],
  };
}

export function getModelDelegate(client: any, model: string) {
  const modelProperty = toModelProperty(model);
  const delegate = client?.[modelProperty];

  if (!delegate) {
    throw new Error(`prisma-soft-delete-extension: Unable to resolve Prisma delegate for model "${model}".`);
  }

  return delegate;
}

export function getConfiguredModelOrThrow(
  model: string,
  models: ResolvedModels,
  capability: string
): ResolvedModelConfig {
  const cfg = models.get(model);
  if (!cfg) {
    throw new Error(
      `prisma-soft-delete-extension: ${capability} is only available for configured soft-delete models. Model "${model}" is not configured.`
    );
  }

  return cfg;
}
