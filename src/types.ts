export interface ModelConfig {
  field: string;
}

export type ModelsConfig = Record<string, true | ModelConfig>;

export interface SoftDeleteConfig {
  /** Default soft-delete timestamp field. Defaults to 'deletedAt'. */
  field?: string;
  /** Models that participate in soft delete. */
  models: ModelsConfig;
}

export interface ResolvedModelConfig {
  field: string;
}
