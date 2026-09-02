import type { MigrationMode } from '../migrator/migration-mode';

const obsoleteDryRunGuidance = 'Planning is now the default. Remove --dry-run; use --write to apply changes.';

export function resolveMigrationMode(argv: readonly string[], write: boolean): MigrationMode {
  const cliArguments = argv.slice(2);
  const optionTerminator = cliArguments.indexOf('--');
  const optionArguments = optionTerminator === -1 ? cliArguments : cliArguments.slice(0, optionTerminator);

  if (optionArguments.some(argument => argument === '--dry-run' || argument.startsWith('--dry-run='))) {
    throw new Error(obsoleteDryRunGuidance);
  }
  if (optionArguments.filter(argument => argument === '--write').length > 1) {
    throw new Error('--write may only be specified once.');
  }

  return write ? 'write' : 'plan';
}
