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

/**
 * Returns the input client unchanged at runtime while widening supported read-method types
 * to accept `includeSoftDeleted?: boolean`.
 */
export function withSoftDeleteTypes<T>(client: T): SoftDeleteTypedClient<T> {
  return client as SoftDeleteTypedClient<T>;
}
