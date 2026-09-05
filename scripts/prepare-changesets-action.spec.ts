import { execFile } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const repository = resolve(import.meta.dirname, '..');

describe('prepare Changesets action input', () => {
  it('removes only consumed prerelease archives before the action reads pending changesets', async () => {
    const temporaryRepository = await mkdtemp(join(tmpdir(), 'changesets-action-input-'));
    const changesetDirectory = join(temporaryRepository, '.changeset');
    const pendingChangeset = join(changesetDirectory, 'pending-release.md');
    const prereleaseState = join(changesetDirectory, 'pre.json');
    const archivedChangeset = join(changesetDirectory, 'pre', 'already-released.md');

    try {
      await mkdir(join(changesetDirectory, 'pre'), { recursive: true });
      await writeFile(pendingChangeset, 'pending', 'utf8');
      await writeFile(prereleaseState, '{"mode":"pre","tag":"beta"}\n', 'utf8');
      await writeFile(archivedChangeset, 'released', 'utf8');

      await execFileAsync(process.execPath, [
        join(repository, 'scripts', 'prepare-changesets-action.mjs'),
        temporaryRepository,
      ]);

      await expect(access(join(changesetDirectory, 'pre'))).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(readFile(pendingChangeset, 'utf8')).resolves.toBe('pending');
      await expect(readFile(prereleaseState, 'utf8')).resolves.toBe('{"mode":"pre","tag":"beta"}\n');
    } finally {
      await rm(temporaryRepository, { recursive: true, force: true });
    }
  });
});
