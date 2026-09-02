import type { MigrationMode } from '../migrator/migration-mode';

const obsoleteDryRunGuidance = 'Planning is now the default. Remove --dry-run; use --write to apply changes.';

export function resolveMigrationMode(argv: readonly string[], write: boolean): MigrationMode {
  if (argv.some(argument => argument === '--dry-run' || argument.startsWith('--dry-run='))) {
    throw new Error(obsoleteDryRunGuidance);
  }

  return write ? 'write' : 'plan';
}
