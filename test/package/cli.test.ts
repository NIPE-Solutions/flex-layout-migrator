import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

describe('built CLI', () => {
  it('prints the package version without rendering a banner', async () => {
    const { stdout } = await execFileAsync(process.execPath, ['dist/cli.js', '--version']);

    expect(stdout.trim()).toBe('2.0.0-beta.0');
    expect(stdout).not.toContain('Flex-Layout Migrator');
  });
});
