import { access, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import ignore from 'ignore';

import { readSiteRouteManifest } from './documentation-route-manifest.mjs';

const productionOrigin = 'https://angular-flex-layout-codemod.nipesolutions.com';
const maximumEntryBytes = 500 * 1024;
const compilerSentinels = ['Parser Error', 'Unexpected closing tag', 'Incomplete block'];

export async function verifyStaticOutput(projectRoot) {
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
  const routeManifest = await readSiteRouteManifest(projectRoot);
  const siteRoutes = routeManifest.map(route => route.path);
  const requiredRoutes = siteRoutes.filter(route => route.startsWith('/docs'));
  const deepLinkRoutes = siteRoutes.filter(route => route !== '/');

  assertCanonicalMetadata(html, routeManifest[0]);
  assertVercelContract(vercel, deepLinkRoutes);
  assertVercelMetadataIgnored(gitignore);
  assertCrawlerFiles(sitemap, robots, siteRoutes);
  await assertRouteDocuments(
    dist,
    routeManifest.filter(route => route.path !== '/'),
  );

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

  await assertCompilerIsLazy({ dist, entrySource, manifest });

  return { hashedAssets: assetFiles.length, documentationRoutes: requiredRoutes.length };
}

function assertVercelMetadataIgnored(gitignore) {
  const matcher = ignore().add(gitignore);
  if (!matcher.ignores('.vercel/project.json')) {
    throw new Error('.vercel/project.json must be ignored by Git');
  }
  if (!matcher.ignores('.env.local')) throw new Error('.env.local must be ignored by Git');
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

export function assertCrawlerFiles(sitemap, robots, siteRoutes) {
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

async function assertRouteDocuments(dist, routes) {
  for (const route of routes) {
    const routeHtml = await readFile(path.join(dist, `${route.path.slice(1)}.html`), 'utf8').catch(() => '');
    try {
      assertExactSeoMetadata(routeHtml, route);
    } catch {
      throw new Error(`raw route metadata is incorrect for ${route.path}`);
    }
  }
}

function assertCanonicalMetadata(html, homeRoute) {
  try {
    assertExactSeoMetadata(html, homeRoute);
  } catch {
    throw new Error('index.html SEO metadata is incomplete or inconsistent with the route manifest');
  }
  if (/\/(?:src\/|@vite\/client)|\.tsx(?:[?"'])/u.test(html)) {
    throw new Error('index.html references source code instead of built assets');
  }
}

function assertExactSeoMetadata(html, route) {
  const normalizedHtml = html.replace(/\s+/gu, ' ');
  const routeUrl = `${productionOrigin}${route.path}`;
  const title = escapeHtml(route.title);
  const description = escapeHtml(route.description);
  const image = `${productionOrigin}/og-image.png`;
  const imageAlt = 'Angular Flex-Layout migration from source through review plan to output';
  const expected = [
    `<link rel="canonical" href="${routeUrl}"`,
    `<title>${title}</title>`,
    `<meta name="description" content="${description}"`,
    '<meta property="og:type" content="website"',
    '<meta property="og:site_name" content="Angular Flex-Layout Codemod"',
    '<meta property="og:locale" content="en_US"',
    `<meta property="og:url" content="${routeUrl}"`,
    `<meta property="og:title" content="${title}"`,
    `<meta property="og:description" content="${description}"`,
    `<meta property="og:image" content="${image}"`,
    '<meta property="og:image:width" content="1200"',
    '<meta property="og:image:height" content="630"',
    `<meta property="og:image:alt" content="${imageAlt}"`,
    '<meta name="twitter:card" content="summary_large_image"',
    `<meta name="twitter:title" content="${title}"`,
    `<meta name="twitter:description" content="${description}"`,
    `<meta name="twitter:image" content="${image}"`,
    `<meta name="twitter:image:alt" content="${imageAlt}"`,
  ];
  if (expected.some(fragment => !normalizedHtml.includes(fragment))) {
    throw new Error(`metadata mismatch for ${route.path}`);
  }
}

function assertVercelContract(vercel, deepLinkRoutes) {
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

  assertRouteDeliveryContract(vercel, deepLinkRoutes);
}

export function assertRouteDeliveryContract(vercel, deepLinkRoutes) {
  const expectedRedirects = deepLinkRoutes.map(route => ({
    source: `${route}.html`,
    destination: route,
    permanent: true,
  }));
  if (JSON.stringify(vercel.redirects) !== JSON.stringify(expectedRedirects)) {
    throw new Error('vercel.json must define canonical HTML redirects for every deep-link document');
  }
  const expectedRewrites = [
    ...deepLinkRoutes.map(route => ({ source: route, destination: `${route}.html` })),
    { source: '/(.*)', destination: '/index.html' },
  ];
  if (JSON.stringify(vercel.rewrites) !== JSON.stringify(expectedRewrites)) {
    throw new Error('vercel.json must deliver exact route documents before the SPA fallback');
  }
}

function escapeHtml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
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

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolveRoot(process.argv.slice(2));
  try {
    const result = await verifyStaticOutput(root);
    process.stdout.write(
      `Website static output verified: ${result.documentationRoutes} routes, ${result.hashedAssets} hashed assets.\n`,
    );
  } catch (error) {
    process.stderr.write(
      `Website static verification failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
