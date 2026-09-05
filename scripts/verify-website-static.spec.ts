import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { afterEach, describe, expect, it } from 'vitest';

const verifier = new URL('./verify-website-static.mjs', import.meta.url);
const temporaryRoots: string[] = [];
const requiredRoutes = [
  '/docs',
  '/docs/cli',
  '/docs/tailwind',
  '/docs/native-css',
  '/docs/safety',
  '/docs/troubleshooting',
];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe('website static output verification', () => {
  it('accepts deployable output with canonical metadata, hashed assets, six routes, and safe Vercel routing', async () => {
    const root = await createFixture();

    const verification = runVerifier(root);

    expect(verification.stderr).toBe('');
    expect(verification.status).toBe(0);
    expect(verification.stdout).toContain('Website static output verified: 6 routes, 2 hashed assets.');
  });

  it('rejects a source-bearing HTML entry instead of a production bundle', async () => {
    const root = await createFixture({ sourceEntry: true });

    const verification = runVerifier(root);

    expect(verification.status).toBe(1);
    expect(verification.stderr).toContain('index.html references source code instead of built assets');
  });

  it('rejects an output that omits a required documentation route', async () => {
    const root = await createFixture({ routes: requiredRoutes.slice(0, -1) });

    const verification = runVerifier(root);

    expect(verification.status).toBe(1);
    expect(verification.stderr).toContain('built JavaScript is missing route /docs/troubleshooting');
  });

  it('rejects an oversized entry bundle that would eagerly load the compiler on documentation routes', async () => {
    const root = await createFixture({ entryBytes: 500 * 1024 + 1 });

    const verification = runVerifier(root);

    expect(verification.status).toBe(1);
    expect(verification.stderr).toContain('entry JavaScript exceeds the 500 KiB eager-load budget');
  });

  it('rejects an unhashed lazy asset that cannot be cached immutably', async () => {
    const root = await createFixture({ unhashedAsset: true });

    const verification = runVerifier(root);

    expect(verification.status).toBe(1);
    expect(verification.stderr).toContain('asset is not content-hashed: /assets/playground.js');
  });
});

async function createFixture(
  options: {
    readonly sourceEntry?: boolean;
    readonly routes?: readonly string[];
    readonly entryBytes?: number;
    readonly unhashedAsset?: boolean;
  } = {},
): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'website-static-'));
  temporaryRoots.push(root);
  const dist = path.join(root, 'website', 'dist');
  const assets = path.join(dist, 'assets');
  await mkdir(assets, { recursive: true });

  const routes = options.routes ?? requiredRoutes;
  const routeSource = routes.map(route => JSON.stringify(route)).join(';');
  const entrySource = `${routeSource};${'x'.repeat(Math.max(0, (options.entryBytes ?? 0) - routeSource.length - 1))}`;
  await writeFile(path.join(assets, 'index-Ab12Cd34.js'), entrySource);
  await writeFile(path.join(assets, 'index-Ef56Gh78.css'), ':root{color:#111b24}');
  if (options.unhashedAsset) await writeFile(path.join(assets, 'playground.js'), 'export{}');
  await writeFile(
    path.join(dist, 'index.html'),
    `<!doctype html><html lang="en"><head><link rel="canonical" href="https://angular-flex-layout-codemod.nipesolutions.com/" /><link rel="stylesheet" href="/assets/index-Ef56Gh78.css" /></head><body><div id="root"></div><script type="module" src="${options.sourceEntry ? '/src/main.tsx' : '/assets/index-Ab12Cd34.js'}"></script></body></html>`,
  );
  await writeFile(
    path.join(root, 'vercel.json'),
    JSON.stringify({
      $schema: 'https://openapi.vercel.sh/vercel.json',
      framework: 'vite',
      installCommand: 'npm ci',
      buildCommand: 'npm run build:website',
      outputDirectory: 'website/dist',
      headers: [
        {
          source: '/assets/(.*)',
          headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
        },
        {
          source: '/(.*)',
          headers: [
            { key: 'X-Content-Type-Options', value: 'nosniff' },
            { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          ],
        },
      ],
      rewrites: [{ source: '/(.*)', destination: '/index.html' }],
    }),
  );
  return root;
}

function runVerifier(root: string) {
  return spawnSync(process.execPath, [verifier.pathname, '--root', root], {
    encoding: 'utf8',
  });
}
