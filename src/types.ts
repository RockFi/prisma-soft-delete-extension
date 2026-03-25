/** Per-model override for the nullable `DateTime` soft-delete field. */
export interface ModelConfig {
  field: string;
}

/** Mapping of Prisma model names to soft-delete participation settings. */
export type ModelsConfig = Record<string, true | ModelConfig>;

/** Configuration for {@link createSoftDeleteExtension}. */
export interface SoftDeleteConfig {
  /** Default soft-delete timestamp field. Defaults to 'deletedAt'. */
  field?: string;
  /** Models that participate in soft delete. */
  models: ModelsConfig;
}

/** Resolved soft-delete settings for a model after global defaults are applied. */
export interface ResolvedModelConfig {
  field: string;
}
