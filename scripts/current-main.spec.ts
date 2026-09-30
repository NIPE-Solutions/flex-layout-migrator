import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import * as release from './release-artifact.mjs';

const commit = '0123456789abcdef0123456789abcdef01234567';
const stale = 'abcdef0123456789abcdef0123456789abcdef01';

describe('current remote main verification', () => {
  function verify(stdout: string, head = `${commit}\n`, sha = commit) {
    const execFileImpl = vi.fn(async (_file: string, args: string[]) => ({
      stdout: args[0] === 'rev-parse' ? head : stdout,
    }));
    return {
      execFileImpl,
      result: release.verifyCurrentMain({ githubSha: sha, execFileImpl }),
    };
  }

  it('accepts only the checked-out GitHub commit from a fresh exact-ref lookup', async () => {
    const { result, execFileImpl } = verify(`${commit}\trefs/heads/main\n`);
    await expect(result).resolves.toBe(commit);
    expect(execFileImpl.mock.calls.map(([file, args]) => [file, args])).toEqual([
      ['git', ['rev-parse', '--verify', 'HEAD']],
      ['git', ['ls-remote', '--exit-code', 'origin', 'refs/heads/main']],
    ]);
  });

  it.each([
    ['stale', `${stale}\trefs/heads/main\n`],
    ['missing', ''],
    ['ambiguous', `${commit}\trefs/heads/main\n${commit}\trefs/heads/main\n`],
    ['wrong ref', `${commit}\trefs/heads/other\n`],
    ['malformed', 'invalid\trefs/heads/main\n'],
    ['extra blank line', `${commit}\trefs/heads/main\n\n`],
  ])('rejects %s remote results', async (_label, stdout) => {
    await expect(verify(stdout).result).rejects.toThrow(/Current main boundary/);
  });

  it.each([
    ['mismatched checkout', `${stale}\n`, commit],
    ['missing HEAD', '', commit],
    ['ambiguous HEAD', `${commit}\n${commit}\n`, commit],
    ['extra HEAD blank line', `${commit}\n\n`, commit],
    ['missing GitHub SHA', `${commit}\n`, ''],
  ])('rejects %s', async (_label, head, sha) => {
    await expect(verify(`${commit}\trefs/heads/main\n`, head, sha).result).rejects.toThrow(/Current main boundary/);
  });

  it.each(['rev-parse', 'ls-remote'])('fails closed when %s fails', async failingCommand => {
    const execFileImpl = vi.fn(async (_file: string, args: string[]) => {
      if (args[0] === failingCommand) throw new Error('lookup failed');
      return { stdout: `${commit}\n` };
    });
    await expect(release.verifyCurrentMain({ githubSha: commit, execFileImpl })).rejects.toThrow(
      /Current main boundary.*lookup failed/,
    );
  });

  it('routes the command-line freshness check to the fail-closed GitHub SHA guard', async () => {
    await expect(
      promisify(execFile)(
        process.execPath,
        [fileURLToPath(new URL('./release-artifact.mjs', import.meta.url)), '--verify-current-main'],
        {
          env: { ...process.env, GITHUB_SHA: '' },
        },
      ),
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('Current main boundary requires a valid GitHub commit SHA'),
    });
  });
});
