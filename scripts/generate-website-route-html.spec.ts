import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { afterEach, describe, expect, it } from 'vitest';

const generator = new URL('./generate-website-route-html.mjs', import.meta.url);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe('website route HTML generation', () => {
  it('emits raw metadata documents for every non-root route without changing the root document', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'website-routes-'));
    roots.push(root);
    const dist = path.join(root, 'website', 'dist');
    await mkdir(dist, { recursive: true });
    await cp(path.join(import.meta.dirname, '../website/content'), path.join(root, 'website/content'), {
      recursive: true,
    });
    const rootHtml = `<!doctype html><html><head>
<title>Flex Layout Codemod</title>
<meta name="description" content="Root description" />
<link rel="canonical" href="https://angular-flex-layout-codemod.nipesolutions.com/" />
<meta property="og:url" content="https://angular-flex-layout-codemod.nipesolutions.com/" />
<meta property="og:title" content="Flex Layout Codemod" />
<meta property="og:description" content="Root description" />
<meta name="twitter:title" content="Flex Layout Codemod" />
<meta name="twitter:description" content="Root description" />
</head><body></body></html>`;
    await writeFile(path.join(dist, 'index.html'), rootHtml);

    const generation = spawnSync(process.execPath, [generator.pathname, '--root', root], { encoding: 'utf8' });

    expect(generation.status).toBe(0);
    expect(generation.stderr).toBe('');
    expect(generation.stdout).toContain('Generated route metadata for 27 deep links.');
    expect(await readFile(path.join(dist, 'index.html'), 'utf8')).toBe(rootHtml);
    expect(await readFile(path.join(dist, 'docs', 'tailwind.html'), 'utf8')).toContain(
      '<link rel="canonical" href="https://angular-flex-layout-codemod.nipesolutions.com/docs/tailwind"',
    );
    expect(await readFile(path.join(dist, 'privacy.html'), 'utf8')).toContain(
      '<meta property="og:url" content="https://angular-flex-layout-codemod.nipesolutions.com/privacy"',
    );
  });
});
