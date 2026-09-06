import { access, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import ignore from 'ignore';

import { readSiteRouteManifest } from './documentation-route-manifest.mjs';
import { readTagAttributes, stripMarkupComments } from './authoritative-markup.mjs';

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
  const expectedUrls = siteRoutes.map(route => `${productionOrigin}${route}`);
  const sitemapUrls = parseSitemapUrls(sitemap);
  const duplicate = sitemapUrls.find((url, index) => sitemapUrls.indexOf(url) !== index);
  if (duplicate !== undefined) throw new Error(`sitemap.xml contains duplicate URL ${duplicate}`);
  const expectedSet = new Set(expectedUrls);
  const unexpected = sitemapUrls.find(url => !expectedSet.has(url));
  if (unexpected !== undefined) throw new Error(`sitemap.xml contains unexpected URL ${unexpected}`);
  const sitemapSet = new Set(sitemapUrls);
  const missing = expectedUrls.find(url => !sitemapSet.has(url));
  if (missing !== undefined) throw new Error(`sitemap.xml is missing required URL ${missing}`);
  if (sitemapUrls.length !== expectedUrls.length) {
    throw new Error('sitemap.xml URL set does not exactly match the route manifest');
  }
  const expectedRobots = `User-agent: *\nAllow: /\nSitemap: ${productionOrigin}/sitemap.xml\n`;
  if (robots !== expectedRobots) {
    throw new Error('robots.txt must equal the exact production crawler policy');
  }
}

async function assertRouteDocuments(dist, routes) {
  for (const route of routes) {
    const routeHtml = await readFile(path.join(dist, `${route.path.slice(1)}.html`), 'utf8').catch(() => '');
    try {
      assertExactSeoMetadata(routeHtml, route);
    } catch (error) {
      throw new Error(`raw route metadata is incorrect for ${route.path}: ${errorMessage(error)}`, { cause: error });
    }
  }
}

function assertCanonicalMetadata(html, homeRoute) {
  try {
    assertExactSeoMetadata(html, homeRoute);
  } catch (error) {
    throw new Error(
      `index.html SEO metadata is incomplete or inconsistent with the route manifest: ${errorMessage(error)}`,
      { cause: error },
    );
  }
  if (/\/(?:src\/|@vite\/client)|\.tsx(?:[?"'])/u.test(html)) {
    throw new Error('index.html references source code instead of built assets');
  }
}

function assertExactSeoMetadata(html, route) {
  const activeHtml = stripMarkupComments(html, {
    relevantElement: /<(?:title|meta|link)\b/iu,
    relevantMessage: 'HTML comments must not contain authoritative metadata elements',
    malformedMessage: 'HTML contains malformed comments',
  });
  const routeUrl = `${productionOrigin}${route.path}`;
  const title = escapeHtml(route.title);
  const description = escapeHtml(route.description);
  const image = `${productionOrigin}/og-image.png`;
  const imageAlt = 'Angular Flex-Layout migration from source through review plan to output';
  const titles = [...activeHtml.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/giu)];
  const titleOpenings = [...activeHtml.matchAll(/<title\b/giu)].length;
  if (titles.length !== 1 || titleOpenings !== 1) {
    throw new Error(`expected exactly one title, found ${titleOpenings}`);
  }
  if (titles[0]?.[1] !== title) throw new Error(`title value mismatch for ${route.path}`);

  const linkTags = [...activeHtml.matchAll(/<link\b[^>]*>/giu)].map(match => readTagAttributes(match[0]));
  assertSingleMetadataValue(
    linkTags.filter(attributes => hasToken(attributes.get('rel'), 'canonical')),
    'canonical',
    'href',
    routeUrl,
  );

  const metaTags = [...activeHtml.matchAll(/<meta\b[^>]*>/giu)].map(match => readTagAttributes(match[0]));
  const expected = [
    ['name', 'description', description],
    ['property', 'og:type', 'website'],
    ['property', 'og:site_name', 'Angular Flex-Layout Codemod'],
    ['property', 'og:locale', 'en_US'],
    ['property', 'og:url', routeUrl],
    ['property', 'og:title', title],
    ['property', 'og:description', description],
    ['property', 'og:image', image],
    ['property', 'og:image:width', '1200'],
    ['property', 'og:image:height', '630'],
    ['property', 'og:image:alt', imageAlt],
    ['name', 'twitter:card', 'summary_large_image'],
    ['name', 'twitter:title', title],
    ['name', 'twitter:description', description],
    ['name', 'twitter:image', image],
    ['name', 'twitter:image:alt', imageAlt],
  ];
  for (const [selector, key, value] of expected) {
    assertSingleMetadataValue(
      metaTags.filter(attributes => attributes.get(selector)?.toLowerCase() === key.toLowerCase()),
      key,
      'content',
      value,
    );
  }
}

function hasToken(value, expected) {
  return value?.split(/\s+/u).some(token => token.toLowerCase() === expected) ?? false;
}

function parseSitemapUrls(sitemap) {
  if (sitemap.trim() === '') return [];
  const activeXml = stripMarkupComments(sitemap, {
    relevantElement: /<loc\b/iu,
    relevantMessage: 'sitemap.xml comments must not contain loc elements',
    malformedMessage: 'sitemap.xml has invalid comment structure',
  });
  const document = activeXml.match(
    /^\s*<\?xml\s+version="1\.0"\s+encoding="UTF-8"\s*\?>\s*<urlset\s+xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"\s*>\s*([\s\S]*?)\s*<\/urlset>\s*$/u,
  );
  if (document === null) throw new Error('sitemap.xml has invalid structure');
  const body = document[1] ?? '';
  const urls = [];
  const entryPattern = /<url\s*>\s*<loc\s*>([^<]+)<\/loc\s*>\s*<\/url\s*>/gu;
  let cursor = 0;
  for (const match of body.matchAll(entryPattern)) {
    if (body.slice(cursor, match.index).trim() !== '') throw new Error('sitemap.xml has invalid structure');
    urls.push(match[1].trim());
    cursor = (match.index ?? 0) + match[0].length;
  }
  if (body.slice(cursor).trim() !== '') throw new Error('sitemap.xml has invalid structure');
  return urls;
}

function assertSingleMetadataValue(tags, key, valueAttribute, expectedValue) {
  if (tags.length !== 1) throw new Error(`expected exactly one ${key}, found ${tags.length}`);
  if (tags[0]?.get(valueAttribute) !== expectedValue) throw new Error(`${key} value mismatch`);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
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
  const rootRedirect = { source: '/index.html', destination: '/', permanent: true };
  const expectedRedirects = [
    rootRedirect,
    ...deepLinkRoutes.map(route => ({
      source: `${route}.html`,
      destination: route,
      permanent: true,
    })),
  ];
  if (JSON.stringify(vercel.redirects?.[0]) !== JSON.stringify(rootRedirect)) {
    throw new Error('vercel.json must define the permanent root HTML redirect from /index.html to /');
  }
  if (JSON.stringify(vercel.redirects) !== JSON.stringify(expectedRedirects)) {
    throw new Error('vercel.json must define canonical HTML redirects for every deep-link document');
  }
  const expectedRewrites = [...deepLinkRoutes.map(route => ({ source: route, destination: `${route}.html` }))];
  if (JSON.stringify(vercel.rewrites) !== JSON.stringify(expectedRewrites)) {
    throw new Error('vercel.json must deliver exact route documents without a homepage fallback');
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
