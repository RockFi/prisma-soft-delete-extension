import type { SoftDeleteConfig, ResolvedModelConfig } from './types';

const DEFAULT_FIELD = 'deletedAt';

/**
 * Preserves model-name literals while validating a soft-delete config object.
 *
 * This is useful when the same config is passed to `createSoftDeleteExtension()`
 * and `withSoftDeleteTypes(..., config)`.
 */
export function defineSoftDeleteConfig<const C extends SoftDeleteConfig>(config: C): C {
  return config;
}

export function resolveConfig(config: SoftDeleteConfig): Map<string, ResolvedModelConfig> {
  const globalField = config.field ?? DEFAULT_FIELD;
  const map = new Map<string, ResolvedModelConfig>();
  for (const [model, value] of Object.entries(config.models)) {
    map.set(model, { field: value === true ? globalField : value.field });
  }
  return map;
}
