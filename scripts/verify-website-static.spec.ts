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
    expect(verification.stdout).toContain('Website static output verified: 6 routes, 3 hashed assets.');
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

  it('matches route tokens exactly instead of accepting a child route for /docs', async () => {
    const root = await createFixture({ routes: requiredRoutes.slice(1) });

    const verification = runVerifier(root);

    expect(verification.status).toBe(1);
    expect(verification.stderr).toContain('built JavaScript is missing route /docs');
  });

  it('rejects an oversized entry bundle that would eagerly load the compiler on documentation routes', async () => {
    const root = await createFixture({ entryBytes: 500 * 1024 + 1 });

    const verification = runVerifier(root);

    expect(verification.status).toBe(1);
    expect(verification.stderr).toContain('eager JavaScript graph exceeds the 500 KiB aggregate budget');
  });

  it('rejects an aggregate eager graph above budget when every imported chunk is individually below it', async () => {
    const root = await createFixture({ aggregateEagerImports: true });

    const verification = runVerifier(root);

    expect(verification.status).toBe(1);
    expect(verification.stderr).toContain('eager JavaScript graph exceeds the 500 KiB aggregate budget');
    expect(verification.stderr).toContain('532575 bytes');
  });

  it('rejects an unhashed lazy asset that cannot be cached immutably', async () => {
    const root = await createFixture({ unhashedAsset: true });

    const verification = runVerifier(root);

    expect(verification.status).toBe(1);
    expect(verification.stderr).toContain('asset is not content-hashed: /assets/playground.js');
  });

  it('rejects compiler code that is eager instead of reachable through the playground dynamic entry', async () => {
    const root = await createFixture({ eagerCompiler: true });

    const verification = runVerifier(root);

    expect(verification.status).toBe(1);
    expect(verification.stderr).toContain('Angular compiler sentinel found in eager entry JavaScript');
  });

  it('rejects an eager imported chunk containing all Angular compiler sentinels', async () => {
    const root = await createFixture({ eagerImportedCompiler: true });

    const verification = runVerifier(root);

    expect(verification.status).toBe(1);
    expect(verification.stderr).toContain(
      'Angular compiler sentinel found in eager JavaScript graph: assets/eager-Compiler1.js',
    );
  });

  it('rejects Angular compiler sentinels in a recursively nested eager import', async () => {
    const root = await createFixture({ nestedEagerCompiler: true });

    const verification = runVerifier(root);

    expect(verification.status).toBe(1);
    expect(verification.stderr).toContain(
      'Angular compiler sentinel found in eager JavaScript graph: assets/nested-eager-Qq55Rr66.js',
    );
  });

  it('rejects compiler sentinels split among sub-threshold eager imports', async () => {
    const root = await createFixture({ splitEagerCompiler: true });

    const verification = runVerifier(root);

    expect(verification.status).toBe(1);
    expect(verification.stderr).toContain('Angular compiler sentinel found in eager JavaScript graph');
  });

  it('accepts compiler evidence split across recursively reachable lazy-only chunks', async () => {
    const root = await createFixture({ splitLazyCompiler: true });

    const verification = runVerifier(root);

    expect(verification.status).toBe(0);
    expect(verification.stderr).toBe('');
  });

  it('does not accept compiler evidence from an unrelated dynamic sibling reached through the eager entry', async () => {
    const root = await createFixture({ siblingDynamicCompiler: true });

    const verification = runVerifier(root);

    expect(verification.status).toBe(1);
    expect(verification.stderr).toContain(
      'playground lazy-only graph is missing Angular compiler sentinel: Parser Error',
    );
  });

  it('rejects compiler-bearing lazy graph overlap that is also eagerly reachable', async () => {
    const root = await createFixture({ overlappingCompilerChunk: true });

    const verification = runVerifier(root);

    expect(verification.status).toBe(1);
    expect(verification.stderr).toContain('compiler-bearing lazy chunk is also reachable from eager graph');
  });

  it('rejects output without the sitemap and robots policy', async () => {
    const root = await createFixture({ crawlerFiles: false });

    const verification = runVerifier(root);

    expect(verification.status).toBe(1);
    expect(verification.stderr).toContain('sitemap.xml is missing required URL');
  });

  it('rejects raw deep-link documents that reuse the root canonical metadata', async () => {
    const root = await createFixture({ routeMetadata: false });

    const verification = runVerifier(root);

    expect(verification.status).toBe(1);
    expect(verification.stderr).toContain('raw route metadata is incorrect for /docs');
  });

  it('rejects a robots policy that blocks the website', async () => {
    const root = await createFixture({ robotsDisallow: true });

    const verification = runVerifier(root);

    expect(verification.status).toBe(1);
    expect(verification.stderr).toContain('robots.txt must explicitly allow crawling');
  });
});

async function createFixture(
  options: {
    readonly sourceEntry?: boolean;
    readonly routes?: readonly string[];
    readonly entryBytes?: number;
    readonly unhashedAsset?: boolean;
    readonly eagerCompiler?: boolean;
    readonly crawlerFiles?: boolean;
    readonly routeMetadata?: boolean;
    readonly robotsDisallow?: boolean;
    readonly aggregateEagerImports?: boolean;
    readonly eagerImportedCompiler?: boolean;
    readonly nestedEagerCompiler?: boolean;
    readonly splitEagerCompiler?: boolean;
    readonly splitLazyCompiler?: boolean;
    readonly siblingDynamicCompiler?: boolean;
    readonly overlappingCompilerChunk?: boolean;
  } = {},
): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'website-static-'));
  temporaryRoots.push(root);
  const dist = path.join(root, 'website', 'dist');
  const assets = path.join(dist, 'assets');
  await mkdir(assets, { recursive: true });

  const routes = options.routes ?? requiredRoutes;
  const routeSource = routes.map(route => JSON.stringify(route)).join(';');
  const compilerSentinel = 'Parser Error: Unexpected closing tag; Incomplete block';
  const entrySource = `${routeSource};${options.eagerCompiler ? compilerSentinel : ''}${'x'.repeat(Math.max(0, (options.entryBytes ?? 0) - routeSource.length - 1))}`;
  await writeFile(path.join(assets, 'index-Ab12Cd34.js'), entrySource);
  await writeFile(path.join(assets, 'index-Ef56Gh78.css'), ':root{color:#111b24}');
  await writeFile(
    path.join(assets, 'playground-Ij90Kl12.js'),
    options.eagerCompiler || options.splitLazyCompiler || options.siblingDynamicCompiler
      ? 'export{}'
      : compilerSentinel,
  );
  const manifestImports: string[] = [];
  const manifestDynamicImports = ['src/components/playground.tsx'];
  const playgroundImports: string[] = [];
  const playgroundDynamicImports: string[] = [];
  const manifestEntries: Record<string, object> = {};
  if (options.aggregateEagerImports) {
    await addManifestAsset('src/eager-one.ts', 'assets/eager-one-Aa11Bb22.js', 'x'.repeat(260 * 1024));
    await addManifestAsset('src/eager-two.ts', 'assets/eager-two-Cc33Dd44.js', 'x'.repeat(260 * 1024));
    manifestImports.push('src/eager-one.ts', 'src/eager-two.ts');
  }
  if (options.eagerImportedCompiler) {
    await addManifestAsset('src/eager-compiler.ts', 'assets/eager-Compiler1.js', compilerSentinel);
    manifestImports.push('src/eager-compiler.ts');
  }
  if (options.nestedEagerCompiler) {
    await addManifestAsset('src/eager-parent.ts', 'assets/eager-parent-Oo11Pp22.js', 'export{}', {
      imports: ['src/nested-eager.ts'],
    });
    await addManifestAsset('src/nested-eager.ts', 'assets/nested-eager-Qq55Rr66.js', compilerSentinel);
    manifestImports.push('src/eager-parent.ts');
  }
  if (options.splitEagerCompiler) {
    for (const [index, sentinel] of ['Parser Error', 'Unexpected closing tag', 'Incomplete block'].entries()) {
      const key = `src/eager-sentinel-${index}.ts`;
      await addManifestAsset(key, `assets/eager-sentinel-${index}-Ee55Ff6${index}.js`, sentinel);
      manifestImports.push(key);
    }
  }
  if (options.splitLazyCompiler) {
    await addManifestAsset('src/lazy-parser.ts', 'assets/lazy-parser-Gg77Hh88.js', 'Parser Error', {
      imports: ['src/lazy-closing.ts'],
    });
    await addManifestAsset('src/lazy-closing.ts', 'assets/lazy-closing-Ii99Jj00.js', 'Unexpected closing tag', {
      dynamicImports: ['src/lazy-block.ts'],
    });
    await addManifestAsset('src/lazy-block.ts', 'assets/lazy-block-Kk11Ll22.js', 'Incomplete block');
    playgroundImports.push('src/lazy-parser.ts');
  }
  if (options.siblingDynamicCompiler) {
    await addManifestAsset('src/unrelated-lazy.ts', 'assets/unrelated-lazy-Ss77Tt88.js', compilerSentinel);
    manifestDynamicImports.push('src/unrelated-lazy.ts');
    playgroundImports.push('index.html');
  }
  if (options.overlappingCompilerChunk) {
    await addManifestAsset('src/shared-compiler.ts', 'assets/shared-compiler-Mm33Nn44.js', compilerSentinel);
    manifestImports.push('src/shared-compiler.ts');
    playgroundImports.push('src/shared-compiler.ts');
  }
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
      rewrites: [
        ...[
          '/docs',
          '/docs/cli',
          '/docs/tailwind',
          '/docs/native-css',
          '/docs/safety',
          '/docs/troubleshooting',
          '/privacy',
          '/imprint',
        ].map(route => ({ source: route, destination: `${route}.html` })),
        { source: '/(.*)', destination: '/index.html' },
      ],
    }),
  );
  await mkdir(path.join(dist, '.vite'), { recursive: true });
  await writeFile(
    path.join(dist, '.vite', 'manifest.json'),
    JSON.stringify({
      'index.html': {
        file: 'assets/index-Ab12Cd34.js',
        isEntry: true,
        imports: manifestImports,
        dynamicImports: manifestDynamicImports,
      },
      'src/components/playground.tsx': {
        file: 'assets/playground-Ij90Kl12.js',
        src: 'src/components/playground.tsx',
        isDynamicEntry: true,
        imports: playgroundImports,
        dynamicImports: playgroundDynamicImports,
      },
      ...manifestEntries,
    }),
  );
  if (options.crawlerFiles !== false) {
    await writeFile(
      path.join(dist, 'sitemap.xml'),
      `<?xml version="1.0" encoding="UTF-8"?><urlset>${['/', ...requiredRoutes, '/privacy', '/imprint']
        .map(route => `<url><loc>https://angular-flex-layout-codemod.nipesolutions.com${route}</loc></url>`)
        .join('')}</urlset>`,
    );
    await writeFile(
      path.join(dist, 'robots.txt'),
      `User-agent: *\n${options.robotsDisallow ? 'Disallow' : 'Allow'}: /\nSitemap: https://angular-flex-layout-codemod.nipesolutions.com/sitemap.xml\n`,
    );
  }
  for (const route of [...requiredRoutes, '/privacy', '/imprint']) {
    const routeUrl = `https://angular-flex-layout-codemod.nipesolutions.com${route}`;
    const metadataUrl =
      options.routeMetadata === false ? 'https://angular-flex-layout-codemod.nipesolutions.com/' : routeUrl;
    const outputPath = path.join(dist, `${route.slice(1)}.html`);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(
      outputPath,
      `<link rel="canonical" href="${metadataUrl}" /><meta property="og:url" content="${metadataUrl}" />`,
    );
  }
  return root;

  async function addManifestAsset(
    key: string,
    file: string,
    source: string,
    graph: { readonly imports?: readonly string[]; readonly dynamicImports?: readonly string[] } = {},
  ): Promise<void> {
    await writeFile(path.join(dist, file), source);
    manifestEntries[key] = { file, src: key, ...graph };
  }
}

function runVerifier(root: string) {
  return spawnSync(process.execPath, [verifier.pathname, '--root', root], {
    encoding: 'utf8',
  });
}
