import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const productionOrigin = 'https://angular-flex-layout-codemod.nipesolutions.com';
const deepLinkRoutes = [
  '/docs',
  '/docs/cli',
  '/docs/tailwind',
  '/docs/native-css',
  '/docs/safety',
  '/docs/troubleshooting',
  '/privacy',
  '/imprint',
];

const projectRoot = resolveRoot(process.argv.slice(2));
const dist = path.join(projectRoot, 'website', 'dist');
const rootHtml = await readFile(path.join(dist, 'index.html'), 'utf8');

for (const route of deepLinkRoutes) {
  const routeUrl = `${productionOrigin}${route}`;
  const routeHtml = rootHtml
    .replace(/<link rel="canonical" href="[^"]+"/u, `<link rel="canonical" href="${routeUrl}"`)
    .replace(/<meta property="og:url" content="[^"]+"/u, `<meta property="og:url" content="${routeUrl}"`);
  if (routeHtml === rootHtml) throw new Error('Root HTML is missing canonical or Open Graph URL metadata.');

  const outputPath = path.join(dist, `${route.slice(1)}.html`);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, routeHtml);
}

process.stdout.write(`Generated route metadata for ${deepLinkRoutes.length} deep links.\n`);

function resolveRoot(arguments_) {
  const rootIndex = arguments_.indexOf('--root');
  if (rootIndex === -1) return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const rootValue = arguments_[rootIndex + 1];
  if (rootValue === undefined) throw new Error('--root requires a directory');
  return path.resolve(rootValue);
}
