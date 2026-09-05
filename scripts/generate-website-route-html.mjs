import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { readSiteRouteManifest } from './documentation-route-manifest.mjs';

const productionOrigin = 'https://angular-flex-layout-codemod.nipesolutions.com';

export async function generateWebsiteRouteHtml(projectRoot) {
  const dist = path.join(projectRoot, 'website', 'dist');
  const rootHtml = await readFile(path.join(dist, 'index.html'), 'utf8');
  const routes = await readSiteRouteManifest(projectRoot);

  for (const route of routes.filter(route => route.path !== '/')) {
    const routeHtml = applyRouteMetadata(rootHtml, route);
    const outputPath = path.join(dist, `${route.path.slice(1)}.html`);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, routeHtml);
  }
  await writeFile(path.join(dist, 'sitemap.xml'), buildSitemap(routes));
  await writeFile(path.join(dist, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${productionOrigin}/sitemap.xml\n`);
  return routes;
}

function applyRouteMetadata(html, route) {
  const routeUrl = `${productionOrigin}${route.path}`;
  const title = escapeHtml(route.title);
  const description = escapeHtml(route.description);
  return replaceRequired(
    replaceRequired(
      replaceRequired(
        replaceRequired(
          replaceRequired(
            replaceRequired(html, /<link rel="canonical" href="[^"]+"/u, `<link rel="canonical" href="${routeUrl}"`),
            /<title>[^<]*<\/title>/u,
            `<title>${title}</title>`,
          ),
          /<meta\s+name="description"\s+content="[^"]*"\s*\/?\s*>/u,
          `<meta name="description" content="${description}" />`,
        ),
        /<meta property="og:url" content="[^"]+"/u,
        `<meta property="og:url" content="${routeUrl}"`,
      ),
      /<meta property="og:title" content="[^"]*"/u,
      `<meta property="og:title" content="${title}"`,
    ),
    /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?\s*>/u,
    `<meta property="og:description" content="${description}" />`,
  );
}

function replaceRequired(source, pattern, replacement) {
  const result = source.replace(pattern, replacement);
  if (result === source) throw new Error(`Root HTML is missing required route metadata matching ${pattern}`);
  return result;
}

function buildSitemap(routes) {
  const urls = routes
    .map(route => `  <url><loc>${escapeHtml(`${productionOrigin}${route.path}`)}</loc></url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

function escapeHtml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function resolveRoot(arguments_) {
  const rootIndex = arguments_.indexOf('--root');
  if (rootIndex === -1) return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const rootValue = arguments_[rootIndex + 1];
  if (rootValue === undefined) throw new Error('--root requires a directory');
  return path.resolve(rootValue);
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const routes = await generateWebsiteRouteHtml(resolveRoot(process.argv.slice(2)));
  process.stdout.write(`Generated route metadata for ${routes.length - 1} deep links.\n`);
}
