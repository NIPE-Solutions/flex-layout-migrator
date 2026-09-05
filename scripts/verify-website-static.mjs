import { access, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

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
  const [html, vercelSource, manifestSource, sitemap, robots] = await Promise.all([
    readFile(indexPath, 'utf8'),
    readFile(path.join(projectRoot, 'vercel.json'), 'utf8'),
    readFile(path.join(dist, '.vite', 'manifest.json'), 'utf8'),
    readFile(path.join(dist, 'sitemap.xml'), 'utf8').catch(() => ''),
    readFile(path.join(dist, 'robots.txt'), 'utf8').catch(() => ''),
  ]);
  const vercel = JSON.parse(vercelSource);
  const manifest = JSON.parse(manifestSource);

  assertCanonicalMetadata(html);
  assertVercelContract(vercel);
  assertCrawlerFiles(sitemap, robots);

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

  const entryPath = path.join(dist, entrySource.replace(/^\//u, ''));
  const entryJavaScript = await readFile(entryPath, 'utf8');
  const entryStats = await stat(entryPath);
  if (entryStats.size > maximumEntryBytes) {
    throw new Error(`entry JavaScript exceeds the 500 KiB eager-load budget (${entryStats.size} bytes)`);
  }

  const javascript = (
    await Promise.all(
      assetFiles.filter(asset => asset.endsWith('.js')).map(asset => readFile(path.join(dist, asset.slice(1)), 'utf8')),
    )
  ).join('\n');
  for (const route of requiredRoutes) {
    if (!javascript.includes(JSON.stringify(route))) throw new Error(`built JavaScript is missing route ${route}`);
  }
  await assertCompilerIsLazy({ dist, entrySource, entryJavaScript, manifest });

  return { hashedAssets: assetFiles.length };
}

async function assertCompilerIsLazy({ dist, entrySource, entryJavaScript, manifest }) {
  if (compilerSentinels.some(sentinel => entryJavaScript.includes(sentinel))) {
    throw new Error('Angular compiler sentinel found in eager entry JavaScript');
  }

  const entry = manifest['index.html'];
  const playgroundKey = Object.keys(manifest).find(key => manifest[key]?.src === 'src/components/playground.tsx');
  if (entry?.file !== entrySource.replace(/^\//u, '') || entry?.isEntry !== true) {
    throw new Error('Vite manifest does not identify the emitted website entry');
  }
  if (
    playgroundKey === undefined ||
    manifest[playgroundKey]?.isDynamicEntry !== true ||
    !entry.dynamicImports?.includes(playgroundKey)
  ) {
    throw new Error('playground must be a dynamic entry from the website entry');
  }

  const playgroundJavaScript = await readFile(path.join(dist, manifest[playgroundKey].file), 'utf8');
  for (const sentinel of compilerSentinels) {
    if (!playgroundJavaScript.includes(sentinel)) {
      throw new Error(`playground dynamic entry is missing Angular compiler sentinel: ${sentinel}`);
    }
  }
}

function assertCrawlerFiles(sitemap, robots) {
  for (const route of siteRoutes) {
    const routeUrl = `${productionOrigin}${route}`;
    if (!sitemap.includes(`<loc>${routeUrl}</loc>`)) {
      throw new Error(`sitemap.xml is missing required URL ${routeUrl}`);
    }
  }
  if (!robots.includes('User-agent: *') || !robots.includes(`Sitemap: ${productionOrigin}/sitemap.xml`)) {
    throw new Error('robots.txt must allow crawling and identify the production sitemap');
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

  if (
    vercel.rewrites?.length !== 1 ||
    vercel.rewrites[0]?.source !== '/(.*)' ||
    vercel.rewrites[0]?.destination !== '/index.html'
  ) {
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
