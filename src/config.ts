import type { SoftDeleteConfig, ResolvedModelConfig } from './types';

const DEFAULT_FIELD = 'deletedAt';

export function resolveConfig(config: SoftDeleteConfig): Map<string, ResolvedModelConfig> {
  const globalField = config.field ?? DEFAULT_FIELD;
  const map = new Map<string, ResolvedModelConfig>();
  for (const [model, value] of Object.entries(config.models)) {
    map.set(model, { field: value === true ? globalField : value.field });
  }
  return map;
}
