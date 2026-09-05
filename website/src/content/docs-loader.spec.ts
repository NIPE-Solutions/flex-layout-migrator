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
