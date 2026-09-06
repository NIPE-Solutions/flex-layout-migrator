import { mkdtemp, writeFile, mkdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadMigrationConfig, assertConfigurationUnchanged } from './migration-config';
const roots: string[] = [];
async function root() {
  const value = await mkdtemp(path.join(tmpdir(), 'target-config-'));
  roots.push(value);
  return value;
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map(value => rm(value, { recursive: true, force: true })));
});
describe('declarative migration config', () => {
  it('loads local imports in order and CLI overrides profile and CSS', async () => {
    const cwd = await root();
    await writeFile(
      path.join(cwd, 'flex-layout-migrator.config.json'),
      JSON.stringify({ tailwind: { stylesheet: './style.css', prefix: 'app' } }),
    );
    await writeFile(
      path.join(cwd, 'style.css'),
      '@import "tailwindcss" prefix(acme); @import "./theme.css"; @theme { --breakpoint-desktop: 90rem; }',
    );
    await writeFile(path.join(cwd, 'theme.css'), '@theme { --breakpoint-*: initial; --breakpoint-desktop: 80rem; }');
    const loaded = await loadMigrationConfig({ cwd, prefix: 'tw' });
    expect(loaded.targetProfile.prefix.value).toBe('tw');
    expect(loaded.targetProfile.breakpoints).toEqual({
      desktop: expect.objectContaining({ value: '90rem', source: 'style.css' }),
    });
    expect(loaded.snapshots).toHaveLength(3);
    await assertConfigurationUnchanged(loaded.snapshots);
    await writeFile(path.join(cwd, 'theme.css'), '@theme { --breakpoint-desktop: 100rem; }');
    await expect(assertConfigurationUnchanged(loaded.snapshots)).rejects.toThrow(/changed/);
  });
  it('does not follow remote, cyclic, escaping or symlink imports', async () => {
    const cwd = await root();
    const outside = await root();
    await writeFile(path.join(outside, 'secret.css'), '@theme { --breakpoint-stolen: 5px; }');
    await symlink(path.join(outside, 'secret.css'), path.join(cwd, 'link.css'));
    await writeFile(
      path.join(cwd, 'style.css'),
      '@import "tailwindcss"; @import "./style.css"; @import "./link.css"; @import "../secret.css"; @import url(https://example.com/x.css);',
    );
    const loaded = await loadMigrationConfig({ cwd, stylesheet: 'style.css' });
    expect(loaded.targetProfile.breakpoints.stolen).toBeUndefined();
    expect(loaded.targetProfile.diagnostics.filter(d => d.code === 'tailwind-import-unresolved')).toHaveLength(4);
  });
  it('rejects executable and malformed config rather than guessing', async () => {
    const cwd = await root();
    await writeFile(path.join(cwd, 'config.js'), 'throw new Error("executed")');
    await expect(loadMigrationConfig({ cwd, config: 'config.js' })).rejects.toThrow(/JSON/);
    await writeFile(path.join(cwd, 'flex-layout-migrator.config.json'), '{"tailwind":{"prefx":"oops"}}');
    await expect(loadMigrationConfig({ cwd })).rejects.toThrow(/prefx/);
  });
  it('uses declared source media with explicit priority', async () => {
    const cwd = await root();
    await mkdir(path.join(cwd, 'src'));
    await writeFile(
      path.join(cwd, 'flex-layout-migrator.config.json'),
      JSON.stringify({
        source: {
          flexLayout: { breakpoints: { narrow: { mediaQuery: 'screen and (max-width: 599px)', priority: 1100 } } },
        },
      }),
    );
    const loaded = await loadMigrationConfig({ cwd });
    expect(loaded.sourceBreakpoints?.narrow).toMatchObject({
      priority: 1100,
      mediaQuery: 'screen and (max-width: 599px)',
    });
  });
});

it('invalidates plans when a local stylesheet symlink changes target', async () => {
  const cwd = await root();
  await writeFile(path.join(cwd, 'a.css'), '@import "tailwindcss" prefix(aaa);');
  await writeFile(path.join(cwd, 'b.css'), '@import "tailwindcss" prefix(bbb);');
  await symlink(path.join(cwd, 'a.css'), path.join(cwd, 'style.css'));
  const loaded = await loadMigrationConfig({ cwd, stylesheet: 'style.css' });
  await rm(path.join(cwd, 'style.css'));
  await symlink(path.join(cwd, 'b.css'), path.join(cwd, 'style.css'));
  await expect(assertConfigurationUnchanged(loaded.snapshots)).rejects.toThrow(/changed/);
});
