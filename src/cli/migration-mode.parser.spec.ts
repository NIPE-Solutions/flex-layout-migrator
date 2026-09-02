import { resolveMigrationMode } from './migration-mode.parser';

describe('resolveMigrationMode', () => {
  test('defaults an invocation without write authorization to plan mode', () => {
    expect(resolveMigrationMode(['node', 'cli', 'input.html'], false)).toBe('plan');
  });

  test('selects write mode when Commander parsed --write', () => {
    expect(resolveMigrationMode(['node', 'cli', 'input.html', '--write'], true)).toBe('write');
  });

  test.each(['--dry-run', '--dry-run=true'])('rejects the obsolete %s option with migration guidance', option => {
    expect(() => resolveMigrationMode(['node', 'cli', option, 'input.html'], false)).toThrow(
      'Planning is now the default. Remove --dry-run; use --write to apply changes.',
    );
  });

  test('allows filenames containing the obsolete option substring', () => {
    expect(resolveMigrationMode(['node', 'cli', 'component--dry-run.html'], false)).toBe('plan');
  });
});
