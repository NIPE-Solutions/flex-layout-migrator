import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { generateWebsiteRouteHtml } from './generate-website-route-html.mjs';
import { readDocumentationRouteManifest } from './documentation-route-manifest.mjs';
import { assertCrawlerFiles, assertRouteDeliveryContract } from './verify-website-static.mjs';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe('website route metadata generation', () => {
  it('emits route-specific HTML and complete crawler files from Markdown metadata', async () => {
    const root = await createFixture();
    await generateWebsiteRouteHtml(root);

    const html = await readFile(path.join(root, 'website/dist/docs/example.html'), 'utf8');
    expect(html).toContain(
      '<link rel="canonical" href="https://angular-flex-layout-codemod.nipesolutions.com/docs/example"',
    );
    expect(html).toContain('<title>Example &amp; review — Angular Flex-Layout Codemod</title>');
    expect(html).toContain('<meta name="description" content="Inspect &quot;safe&quot; route output &amp; metadata."');
    expect(html).toContain('<meta property="og:title" content="Example &amp; review — Angular Flex-Layout Codemod"');
    expect(html).toContain('<meta name="twitter:title" content="Example &amp; review — Angular Flex-Layout Codemod"');
    expect(html).toContain(
      '<meta name="twitter:description" content="Inspect &quot;safe&quot; route output &amp; metadata."',
    );

    const sitemap = await readFile(path.join(root, 'website/dist/sitemap.xml'), 'utf8');
    const robots = await readFile(path.join(root, 'website/dist/robots.txt'), 'utf8');
    expect(sitemap).toContain('<loc>https://angular-flex-layout-codemod.nipesolutions.com/docs/example</loc>');
    expect(robots).toContain('Sitemap: https://angular-flex-layout-codemod.nipesolutions.com/sitemap.xml');
  });

  it('fails crawler verification when one generated documentation URL is removed', async () => {
    const root = await createFixture();
    const manifest = await readDocumentationRouteManifest(root);
    await generateWebsiteRouteHtml(root);
    const sitemap = await readFile(path.join(root, 'website/dist/sitemap.xml'), 'utf8');
    const robots = await readFile(path.join(root, 'website/dist/robots.txt'), 'utf8');
    const routes = ['/', ...manifest.map(route => route.path), '/privacy', '/imprint'];

    expect(() => assertCrawlerFiles(sitemap, robots, routes)).not.toThrow();
    expect(() =>
      assertCrawlerFiles(
        sitemap.replace(
          '  <url><loc>https://angular-flex-layout-codemod.nipesolutions.com/docs/example</loc></url>\n',
          '',
        ),
        robots,
        routes,
      ),
    ).toThrow(/sitemap.xml is missing required URL/u);
  });

  it('fails route delivery verification when a content route loses its exact rewrite', () => {
    const routes = ['/docs', '/docs/example', '/privacy', '/imprint'];
    const complete = {
      redirects: routes.map(route => ({ source: `${route}.html`, destination: route, permanent: true })),
      rewrites: [
        ...routes.map(route => ({ source: route, destination: `${route}.html` })),
        { source: '/(.*)', destination: '/index.html' },
      ],
    };
    expect(() => assertRouteDeliveryContract(complete, routes)).not.toThrow();
    expect(() =>
      assertRouteDeliveryContract(
        { ...complete, rewrites: complete.rewrites.filter(rewrite => rewrite.source !== '/docs') },
        routes,
      ),
    ).toThrow(/exact route documents/u);
  });
});

async function createFixture(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'flex-layout-route-metadata-'));
  temporaryRoots.push(root);
  await mkdir(path.join(root, 'website/content/start'), { recursive: true });
  await mkdir(path.join(root, 'website/dist'), { recursive: true });
  await writeFile(
    path.join(root, 'website/content/start/example.md'),
    `---
path: /docs/example
title: Example & review
description: Inspect "safe" route output & metadata.
group: start
order: 1
---
# Example & review

## Inspect output

Substantive fixture content.
`,
  );
  await writeFile(
    path.join(root, 'website/dist/index.html'),
    `<!doctype html><html><head>
<link rel="canonical" href="https://angular-flex-layout-codemod.nipesolutions.com/" />
<meta name="description" content="Home description." />
<meta property="og:url" content="https://angular-flex-layout-codemod.nipesolutions.com/" />
<meta property="og:title" content="Flex Layout Codemod — NIPE Open Source" />
<meta property="og:description" content="Home description." />
<meta name="twitter:title" content="Flex Layout Codemod — NIPE Open Source" />
<meta name="twitter:description" content="Home description." />
<title>Flex Layout Codemod — NIPE Open Source</title>
</head><body></body></html>`,
  );
  return root;
}
