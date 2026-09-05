import { describe, expect, it } from 'vitest';

import { loadDocumentationPage, parseDocumentationSources, validateDocumentationLinks } from './docs-loader';
import {
  documentationGroups,
  documentationRoutes,
  getDocumentationNeighbors,
  legacyDocumentationPaths,
} from './docs-navigation';

const frontMatter = (overrides = '') => `---
path: /docs/example
title: Example
description: A complete example page used by the parser contract.
group: reference
order: 1
${overrides}---
# Example

This page has substantive content for the documentation loader.

## First heading

The first section has an independently addressable anchor.
`;

function documentationSource({
  path,
  title,
  order,
  body,
}: {
  readonly path: string;
  readonly title: string;
  readonly order: number;
  readonly body: string;
}): string {
  return `---
path: ${path}
title: ${title}
description: A complete page used to exercise relative documentation links.
group: compatibility
order: ${order}
---
# ${title}

${body}
`;
}

describe('documentation content loader', () => {
  it('loads the complete grouped information architecture from repository Markdown', () => {
    expect(documentationGroups.map(group => group.label)).toEqual([
      'Start',
      'Migration Targets',
      'Compatibility',
      'Safety & Review',
      'Reports & Automation',
      'Reference',
      'Project',
    ]);
    expect(documentationRoutes).toHaveLength(25);

    for (const route of documentationRoutes) {
      const page = loadDocumentationPage(route.path);
      expect(page.body.trim(), route.path).not.toBe('');
      expect(page.headings.length, route.path).toBeGreaterThan(0);
      expect(route.editUrl).toMatch(/^https:\/\/github\.com\/NIPE-Solutions\//u);
    }
  });

  it('keeps every legacy documentation URL as an exact content route', () => {
    expect(legacyDocumentationPaths).toEqual([
      '/docs',
      '/docs/cli',
      '/docs/tailwind',
      '/docs/native-css',
      '/docs/safety',
      '/docs/troubleshooting',
    ]);
    for (const path of legacyDocumentationPaths) {
      expect(loadDocumentationPage(path).path).toBe(path);
    }
  });

  it('rejects unknown or incomplete front matter instead of guessing defaults', () => {
    expect(() => parseDocumentationSources({ 'example.md': frontMatter('extra: no\n') })).toThrow(
      /unknown front matter field "extra"/u,
    );
    expect(() =>
      parseDocumentationSources({
        'example.md': frontMatter().replace('description: A complete example page used by the parser contract.\n', ''),
      }),
    ).toThrow(/missing front matter field "description"/u);
  });

  it('rejects duplicate paths and duplicate heading anchors', () => {
    expect(() =>
      parseDocumentationSources({
        'one.md': frontMatter(),
        'two.md': frontMatter(),
      }),
    ).toThrow(/duplicate documentation path \/docs\/example/u);

    expect(() =>
      parseDocumentationSources({
        'example.md': `${frontMatter()}\n## First heading\n\nA repeated stable anchor is ambiguous.\n`,
      }),
    ).toThrow(/duplicate heading id "first-heading"/u);
  });

  it('rejects broken local route and heading links', () => {
    const pages = parseDocumentationSources({
      'example.md': `${frontMatter()}\n[Missing route](/docs/missing)\n[Missing anchor](#not-here)\n`,
    });

    expect(() => validateDocumentationLinks(pages)).toThrow(/broken documentation link \/docs\/missing/u);

    const anchorOnly = parseDocumentationSources({
      'example.md': `${frontMatter()}\n[Missing anchor](#not-here)\n`,
    });
    expect(() => validateDocumentationLinks(anchorOnly)).toThrow(/missing heading #not-here/u);
  });

  it('canonicalizes and validates relative route and fragment links from the source page path', () => {
    const pages = parseDocumentationSources({
      'directives.md': documentationSource({
        path: '/docs/compatibility/directives',
        title: 'Directive behavior',
        order: 1,
        body: `## Families

[Sibling](./dynamic-bindings#runtime-values) and [parent](../tailwind#utility-output).`,
      }),
      'dynamic-bindings.md': documentationSource({
        path: '/docs/compatibility/dynamic-bindings',
        title: 'Dynamic bindings',
        order: 2,
        body: `## Runtime values

Runtime values remain visible.`,
      }),
      'tailwind.md': documentationSource({
        path: '/docs/tailwind',
        title: 'Tailwind CSS',
        order: 3,
        body: `## Utility output

Utilities are explicit.`,
      }),
    });

    expect(() => validateDocumentationLinks(pages)).not.toThrow();
    expect(pages.find(page => page.path === '/docs/compatibility/directives')?.blocks).toContainEqual({
      kind: 'paragraph',
      text: '[Sibling](/docs/compatibility/dynamic-bindings#runtime-values) and [parent](/docs/tailwind#utility-output).',
    });
  });

  it('rejects a missing route reached through a relative link', () => {
    const pages = parseDocumentationSources({
      'directives.md': documentationSource({
        path: '/docs/compatibility/directives',
        title: 'Directive behavior',
        order: 1,
        body: `## Families

[Missing route](./missing).`,
      }),
    });

    expect(() => validateDocumentationLinks(pages)).toThrow(
      /broken documentation link \/docs\/compatibility\/missing/u,
    );
  });

  it('rejects a missing fragment reached through a relative link', () => {
    const pages = parseDocumentationSources({
      'directives.md': documentationSource({
        path: '/docs/compatibility/directives',
        title: 'Directive behavior',
        order: 1,
        body: `## Families

[Missing fragment](./dynamic-bindings#not-here).`,
      }),
      'dynamic-bindings.md': documentationSource({
        path: '/docs/compatibility/dynamic-bindings',
        title: 'Dynamic bindings',
        order: 2,
        body: `## Runtime values

Runtime values remain visible.`,
      }),
    });

    expect(() => validateDocumentationLinks(pages)).toThrow(
      /missing heading #not-here on \/docs\/compatibility\/dynamic-bindings/u,
    );
  });

  it('returns exact previous and next routes and fails for an unregistered active route', () => {
    expect(getDocumentationNeighbors('/docs')).toEqual({
      previous: undefined,
      next: documentationRoutes[1],
    });
    expect(getDocumentationNeighbors(documentationRoutes.at(-1)!.path)).toEqual({
      previous: documentationRoutes.at(-2),
      next: undefined,
    });
    expect(getDocumentationNeighbors('/docs/native-css')).toEqual({
      previous: documentationRoutes.find(route => route.path === '/docs/tailwind'),
      next: documentationRoutes.find(route => route.path === '/docs/responsive-images'),
    });
    expect(() => getDocumentationNeighbors('/docs/not-registered')).toThrow(/active documentation route/u);
  });
});
