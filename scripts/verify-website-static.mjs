import { access, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import ignore from 'ignore';

const productionOrigin = 'https://angular-flex-layout-codemod.nipesolutions.com';
const requiredRoutes = [
  '/docs',
  '/docs/cli',
  '/docs/tailwind',
  '/docs/native-css',
  '/docs/safety',
  '/docs/troubleshooting',
];
const siteRoutes = ['/', ...requiredRoutes, '/privacy', '/imprint'];
const deepLinkRoutes = siteRoutes.filter(route => route !== '/');
const maximumEntryBytes = 500 * 1024;
const compilerSentinels = ['Parser Error', 'Unexpected closing tag', 'Incomplete block'];

const root = resolveRoot(process.argv.slice(2));

try {
  const result = await verifyStaticOutput(root);
  process.stdout.write(
    `Website static output verified: ${requiredRoutes.length} routes, ${result.hashedAssets} hashed assets.\n`,
  );
} catch (error) {
  process.stderr.write(
    `Website static verification failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}

async function verifyStaticOutput(projectRoot) {
  const dist = path.join(projectRoot, 'website', 'dist');
  const indexPath = path.join(dist, 'index.html');
  const [html, vercelSource, manifestSource, sitemap, robots, gitignore] = await Promise.all([
    readFile(indexPath, 'utf8'),
    readFile(path.join(projectRoot, 'vercel.json'), 'utf8'),
    readFile(path.join(dist, '.vite', 'manifest.json'), 'utf8'),
    readFile(path.join(dist, 'sitemap.xml'), 'utf8').catch(() => ''),
    readFile(path.join(dist, 'robots.txt'), 'utf8').catch(() => ''),
    readFile(path.join(projectRoot, '.gitignore'), 'utf8').catch(() => ''),
  ]);
  const vercel = JSON.parse(vercelSource);
  const manifest = JSON.parse(manifestSource);

  assertCanonicalMetadata(html);
  assertVercelContract(vercel);
  assertVercelMetadataIgnored(gitignore);
  assertCrawlerFiles(sitemap, robots);
  await assertRouteDocuments(dist);

  const assetReferences = [...html.matchAll(/(?:href|src)="(\/assets\/[^"?#]+)"/gu)].map(match => match[1]);
  if (assetReferences.length === 0) throw new Error('index.html does not reference built assets');
  const assetFiles = (await readdir(path.join(dist, 'assets'), { withFileTypes: true }))
    .filter(entry => entry.isFile())
    .map(entry => `/assets/${entry.name}`);
  for (const asset of assetFiles) {
    if (!/\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.(?:css|js)$/u.test(asset)) {
      throw new Error(`asset is not content-hashed: ${asset}`);
    }
  }
  await Promise.all(assetReferences.map(asset => access(path.join(dist, asset.slice(1)))));

  const entryMatch = html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/u);
  const entrySource = entryMatch?.[1];
  if (entrySource === undefined || entrySource.startsWith('/src/') || entrySource.endsWith('.tsx')) {
    throw new Error('index.html references source code instead of built assets');
  }

  const javascript = (
    await Promise.all(
      assetFiles.filter(asset => asset.endsWith('.js')).map(asset => readFile(path.join(dist, asset.slice(1)), 'utf8')),
    )
  ).join('\n');
  for (const route of requiredRoutes) {
    if (!javascript.includes(JSON.stringify(route))) throw new Error(`built JavaScript is missing route ${route}`);
  }
  await assertCompilerIsLazy({ dist, entrySource, manifest });

  return { hashedAssets: assetFiles.length };
}

function assertVercelMetadataIgnored(gitignore) {
  if (!ignore().add(gitignore).ignores('.vercel/project.json')) {
    throw new Error('.vercel/project.json must be ignored by Git');
  }
}

async function assertCompilerIsLazy({ dist, entrySource, manifest }) {
  const entry = manifest['index.html'];
  const playgroundKey = Object.keys(manifest).find(key => manifest[key]?.src === 'src/components/playground.tsx');
  if (entry?.file !== entrySource.replace(/^\//u, '') || entry?.isEntry !== true) {
    throw new Error('Vite manifest does not identify the emitted website entry');
  }
  if (playgroundKey === undefined || manifest[playgroundKey]?.isDynamicEntry !== true) {
    throw new Error('playground must be a dynamic entry from the website entry');
  }

  const eagerGraph = collectManifestGraph(manifest, ['index.html'], ['imports']);
  const entryLazyGraph = collectManifestGraph(
    manifest,
    entry.dynamicImports ?? [],
    ['imports', 'dynamicImports'],
    eagerGraph,
  );
  if (!entryLazyGraph.has(playgroundKey)) {
    throw new Error('playground must be reachable only through a dynamic entry from the website entry');
  }

  const playgroundGraph = collectManifestGraph(manifest, [playgroundKey], ['imports', 'dynamicImports'], eagerGraph);
  if (eagerGraph.has(playgroundKey)) {
    throw new Error('playground dynamic entry is also reachable from the eager graph');
  }

  const eagerAssets = await readManifestAssets(dist, manifest, eagerGraph);
  const eagerBytes = eagerAssets.reduce((total, asset) => total + asset.bytes, 0);
  if (eagerBytes > maximumEntryBytes) {
    throw new Error(`eager JavaScript graph exceeds the 500 KiB aggregate budget (${eagerBytes} bytes)`);
  }

  for (const asset of eagerAssets) {
    if (!compilerSentinels.some(sentinel => asset.source.includes(sentinel))) continue;
    if (playgroundGraph.has(asset.key)) {
      throw new Error(`compiler-bearing lazy chunk is also reachable from eager graph: ${asset.file}`);
    }
    if (asset.key === 'index.html') {
      throw new Error('Angular compiler sentinel found in eager entry JavaScript');
    }
    throw new Error(`Angular compiler sentinel found in eager JavaScript graph: ${asset.file}`);
  }

  const lazyOnlyGraph = new Set([...playgroundGraph].filter(key => !eagerGraph.has(key)));
  const lazyAssets = await readManifestAssets(dist, manifest, lazyOnlyGraph);
  const lazyJavaScript = lazyAssets.map(asset => asset.source).join('\n');
  for (const sentinel of compilerSentinels) {
    if (!lazyJavaScript.includes(sentinel)) {
      throw new Error(`playground lazy-only graph is missing Angular compiler sentinel: ${sentinel}`);
    }
  }
}

function collectManifestGraph(manifest, rootKeys, edgeNames, stopExpansionAt = new Set()) {
  const visited = new Set();
  const pending = [...rootKeys];
  while (pending.length > 0) {
    const key = pending.pop();
    if (key === undefined || visited.has(key)) continue;
    const entry = manifest[key];
    if (entry === undefined) throw new Error(`Vite manifest references missing entry ${key}`);
    visited.add(key);
    if (stopExpansionAt.has(key)) continue;
    for (const edgeName of edgeNames) pending.push(...(entry[edgeName] ?? []));
  }
  return visited;
}

async function readManifestAssets(dist, manifest, graph) {
  const assetsByFile = new Map();
  for (const key of graph) {
    const file = manifest[key]?.file;
    if (typeof file !== 'string' || !file.endsWith('.js')) continue;
    if (assetsByFile.has(file)) continue;
    const filePath = path.join(dist, file);
    const [source, fileStats] = await Promise.all([readFile(filePath, 'utf8'), stat(filePath)]);
    assetsByFile.set(file, { key, file, source, bytes: fileStats.size });
  }
  return [...assetsByFile.values()];
}

function assertCrawlerFiles(sitemap, robots) {
  for (const route of siteRoutes) {
    const routeUrl = `${productionOrigin}${route}`;
    if (!sitemap.includes(`<loc>${routeUrl}</loc>`)) {
      throw new Error(`sitemap.xml is missing required URL ${routeUrl}`);
    }
  }
  if (!/^Allow:\s*\/\s*$/mu.test(robots) || /^Disallow:\s*\/\s*$/mu.test(robots)) {
    throw new Error('robots.txt must explicitly allow crawling');
  }
  if (!robots.includes('User-agent: *') || !robots.includes(`Sitemap: ${productionOrigin}/sitemap.xml`)) {
    throw new Error('robots.txt must identify the production sitemap');
  }
}

async function assertRouteDocuments(dist) {
  for (const route of deepLinkRoutes) {
    const routeUrl = `${productionOrigin}${route}`;
    const routeHtml = await readFile(path.join(dist, `${route.slice(1)}.html`), 'utf8').catch(() => '');
    if (
      !routeHtml.includes(`<link rel="canonical" href="${routeUrl}"`) ||
      !routeHtml.includes(`<meta property="og:url" content="${routeUrl}"`)
    ) {
      throw new Error(`raw route metadata is incorrect for ${route}`);
    }
  }
}

function assertCanonicalMetadata(html) {
  const canonical = `<link rel="canonical" href="${productionOrigin}/"`;
  if (!html.includes(canonical)) throw new Error(`index.html canonical URL must be ${productionOrigin}/`);
  if (/\/(?:src\/|@vite\/client)|\.tsx(?:[?"'])/u.test(html)) {
    throw new Error('index.html references source code instead of built assets');
  }
}

function assertVercelContract(vercel) {
  const exactSettings = {
    framework: 'vite',
    installCommand: 'npm ci',
    buildCommand: 'npm run build:website',
    outputDirectory: 'website/dist',
  };
  for (const [key, expected] of Object.entries(exactSettings)) {
    if (vercel[key] !== expected) throw new Error(`vercel.json ${key} must be ${expected}`);
  }

  const assetHeaders = vercel.headers?.find(header => header.source === '/assets/(.*)')?.headers;
  if (
    !assetHeaders?.some(
      header => header.key === 'Cache-Control' && header.value === 'public, max-age=31536000, immutable',
    )
  ) {
    throw new Error('vercel.json must cache hashed assets immutably');
  }

  const securityHeaders = vercel.headers?.find(header => header.source === '/(.*)')?.headers;
  for (const required of [
    ['X-Content-Type-Options', 'nosniff'],
    ['Referrer-Policy', 'strict-origin-when-cross-origin'],
  ]) {
    if (!securityHeaders?.some(header => header.key === required[0] && header.value === required[1])) {
      throw new Error(`vercel.json is missing security header ${required[0]}`);
    }
  }

  const expectedRewrites = [
    ...deepLinkRoutes.map(route => ({ source: route, destination: `${route}.html` })),
    { source: '/(.*)', destination: '/index.html' },
  ];
  if (JSON.stringify(vercel.rewrites) !== JSON.stringify(expectedRewrites)) {
    throw new Error('vercel.json must provide the SPA deep-link fallback');
  }
}

function resolveRoot(arguments_) {
  const rootIndex = arguments_.indexOf('--root');
  if (rootIndex === -1) {
    return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  }
  const rootValue = arguments_[rootIndex + 1];
  if (rootValue === undefined) throw new Error('--root requires a directory');
  return path.resolve(rootValue);
}
