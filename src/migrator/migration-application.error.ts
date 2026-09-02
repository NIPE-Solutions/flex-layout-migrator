export type MigrationApplicationErrorCode =
  | 'invalid-configuration'
  | 'path-collision'
  | 'unsupported-path-type'
  | 'stylesheet-ownership-invalid'
  | 'concurrent-modification'
  | 'transaction-io'
  | 'transaction-interrupted'
  | 'internal-invariant';

export class MigrationApplicationError extends Error {
  readonly recoveryFailures: readonly unknown[];

  constructor(
    readonly code: MigrationApplicationErrorCode,
    message: string,
    readonly paths: readonly string[] = [],
    options?: ErrorOptions & { readonly recoveryFailures?: readonly unknown[] },
  ) {
    super(message, options);
    this.name = 'MigrationApplicationError';
    this.paths = Object.freeze([...paths]);
    this.recoveryFailures = Object.freeze([...(options?.recoveryFailures ?? [])]);
  }
}
