import { access, readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const root = new URL('../../', import.meta.url);

describe('maintainer documentation', () => {
  it('provides contribution, security, support, and governance files', async () => {
    const required = [
      '.github/CODEOWNERS',
      '.github/pull_request_template.md',
      'CHANGELOG.md',
      'CODE_OF_CONDUCT.md',
      'CONTRIBUTING.md',
      'SECURITY.md',
      'docs/SUPPORT.md',
    ];
    await Promise.all(required.map(path => access(new URL(path, root))));

    const contributing = await readFile(new URL('CONTRIBUTING.md', root), 'utf8');
    expect(contributing).toContain('npm ci');
    expect(contributing).toContain('npm run verify');

    const security = await readFile(new URL('SECURITY.md', root), 'utf8');
    expect(security).toContain('private vulnerability reporting');

    const readme = await readFile(new URL('README.md', root), 'utf8');
    expect(readme).toContain('Version 2 is under active development');
    expect(readme).not.toContain('npm install -g @ng-flex/layout-migrator');
  });
});
