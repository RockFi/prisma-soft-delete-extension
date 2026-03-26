import type { SoftDeleteConfig } from './types';

type SoftDeleteReadMethodName =
  | 'findMany'
  | 'findFirst'
  | 'findFirstOrThrow'
  | 'findUnique'
  | 'findUniqueOrThrow'
  | 'count'
  | 'aggregate'
  | 'groupBy';

/** Runtime flag that bypasses soft-delete read filtering for supported operations. */
export interface IncludeSoftDeletedOption {
  includeSoftDeleted?: boolean;
}

type FirstArg<F extends (...args: any[]) => any> = Parameters<F> extends []
  ? never
  : Parameters<F>[0];

type WithIncludeSoftDeletedOverload<F> = F extends (...args: any[]) => any
  ? F &
      (FirstArg<F> extends never
        ? (args?: IncludeSoftDeletedOption) => ReturnType<F>
        : (args: NonNullable<FirstArg<F>> & IncludeSoftDeletedOption) => ReturnType<F>)
  : F;

type WithSoftDeleteDelegateTypes<T> = Omit<T, SoftDeleteReadMethodName> & {
  [K in Extract<keyof T, SoftDeleteReadMethodName>]: WithIncludeSoftDeletedOverload<T[K]>;
};

export type EnabledModelProps<C extends { models: Record<string, unknown> }> =
  Uncapitalize<Extract<keyof C['models'], string>>;

/**
 * Type-only view of a Prisma client with `includeSoftDeleted` added to supported read methods.
 *
 * Apply this to the final client returned by `$extends(createSoftDeleteExtension(...))`.
 */
export type SoftDeleteTypedClient<T> = T & {
  [K in keyof T]: K extends `$${string}`
    ? T[K]
    : T[K] extends (...args: any[]) => any
      ? T[K]
      : WithSoftDeleteDelegateTypes<T[K]>;
};

export type SelectiveSoftDeleteTypedClient<
  TClient,
  C extends { models: Record<string, unknown> },
> = TClient & {
  [K in keyof TClient]: K extends EnabledModelProps<C>
    ? WithSoftDeleteDelegateTypes<TClient[K]>
    : TClient[K];
};

/**
 * Returns the input client unchanged at runtime while widening supported read-method types
 * to accept `includeSoftDeleted?: boolean`.
 *
 * Pass the original soft-delete config as the second argument to widen only configured
 * model delegates. Omitting it keeps the broader compatibility behavior and widens all
 * model delegates.
 */
export function withSoftDeleteTypes<T>(client: T): SoftDeleteTypedClient<T>;
export function withSoftDeleteTypes<T, const C extends SoftDeleteConfig>(
  client: T,
  config: C
): SelectiveSoftDeleteTypedClient<T, C>;
export function withSoftDeleteTypes<T>(client: T, _config?: SoftDeleteConfig): SoftDeleteTypedClient<T> {
  return client as SoftDeleteTypedClient<T>;
}
