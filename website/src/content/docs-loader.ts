import { deepFreeze } from './public-contract';

export type DocumentationGroupId =
  'start' | 'targets' | 'compatibility' | 'safety' | 'reports' | 'reference' | 'project';

export type DocumentationPath = '/docs' | `/docs/${string}`;

export interface DocumentationHeading {
  readonly depth: 2 | 3;
  readonly id: string;
  readonly text: string;
}

export type DocumentationBlock =
  | { readonly kind: 'heading'; readonly depth: 2 | 3; readonly id: string; readonly text: string }
  | { readonly kind: 'paragraph'; readonly text: string }
  | { readonly kind: 'list'; readonly items: readonly string[] }
  | { readonly kind: 'code'; readonly language?: string; readonly value: string };

export interface DocumentationPage {
  readonly path: DocumentationPath;
  readonly title: string;
  readonly description: string;
  readonly group: DocumentationGroupId;
  readonly order: number;
  readonly body: string;
  readonly headings: readonly DocumentationHeading[];
  readonly blocks: readonly DocumentationBlock[];
  readonly editUrl: string;
  readonly sourcePath: string;
}

const documentationGroupIds = new Set<DocumentationGroupId>([
  'start',
  'targets',
  'compatibility',
  'safety',
  'reports',
  'reference',
  'project',
]);
const frontMatterFields = ['path', 'title', 'description', 'group', 'order'] as const;
const rawSources = import.meta.glob('../../content/**/*.md', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>;

export function parseDocumentationSources(sources: Readonly<Record<string, string>>): readonly DocumentationPage[] {
  const pages = Object.entries(sources).map(([sourceName, source]) => parseDocumentationPage(sourceName, source));
  const paths = new Set<string>();
  for (const page of pages) {
    if (paths.has(page.path)) throw new Error(`duplicate documentation path ${page.path}`);
    paths.add(page.path);
  }
  return deepFreeze(pages);
}

export function validateDocumentationLinks(pages: readonly DocumentationPage[]): void {
  const pagesByPath = new Map<string, DocumentationPage>(pages.map(page => [page.path, page]));
  for (const page of pages) {
    for (const match of page.body.matchAll(/\[[^\]]+\]\(([^)]+)\)/gu)) {
      const href = match[1];
      if (href === undefined || (!href.startsWith('/docs') && !href.startsWith('#'))) continue;
      const [pathPart = '', fragment] = href.split('#', 2);
      const targetPath = pathPart === '' ? page.path : pathPart;
      const target = pagesByPath.get(targetPath);
      if (target === undefined) throw new Error(`${page.sourcePath}: broken documentation link ${targetPath}`);
      if (fragment !== undefined && fragment !== '' && !target.headings.some(heading => heading.id === fragment)) {
        throw new Error(`${page.sourcePath}: missing heading #${fragment} on ${targetPath}`);
      }
    }
  }
}

export const documentationPages = parseDocumentationSources(rawSources);
validateDocumentationLinks(documentationPages);

const pagesByPath = new Map<string, DocumentationPage>(documentationPages.map(page => [page.path, page]));

export function loadDocumentationPage(path: string): DocumentationPage {
  const page = pagesByPath.get(path);
  if (page === undefined) throw new Error(`unknown documentation path ${path}`);
  return page;
}

function parseDocumentationPage(sourceName: string, source: string): DocumentationPage {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]+)$/u);
  if (match === null) throw new Error(`${sourceName}: expected front matter followed by a non-empty Markdown body`);
  const metadata = parseFrontMatter(sourceName, match[1] ?? '');
  const body = (match[2] ?? '').trim();
  if (body === '') throw new Error(`${sourceName}: Markdown body must not be empty`);
  const titleHeading = body.match(/^#\s+(.+)$/mu)?.[1]?.trim();
  if (titleHeading !== metadata.title) {
    throw new Error(`${sourceName}: level-one heading must exactly match title "${metadata.title}"`);
  }
  const { blocks, headings } = parseBlocks(sourceName, body);
  const sourcePath = normalizeSourcePath(sourceName);
  return deepFreeze({
    ...metadata,
    body,
    headings,
    blocks,
    sourcePath,
    editUrl: `https://github.com/NIPE-Solutions/flex-layout-migrator/edit/main/website/content/${sourcePath}`,
  });
}

function parseFrontMatter(sourceName: string, source: string) {
  const values = new Map<string, string>();
  for (const line of source.split(/\r?\n/u)) {
    if (line.trim() === '') continue;
    const separator = line.indexOf(':');
    if (separator <= 0) throw new Error(`${sourceName}: invalid front matter line "${line}"`);
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (!frontMatterFields.includes(key as (typeof frontMatterFields)[number])) {
      throw new Error(`${sourceName}: unknown front matter field "${key}"`);
    }
    if (values.has(key)) throw new Error(`${sourceName}: duplicate front matter field "${key}"`);
    values.set(key, value);
  }
  for (const field of frontMatterFields) {
    if (!values.has(field) || values.get(field) === '') {
      throw new Error(`${sourceName}: missing front matter field "${field}"`);
    }
  }
  const path = values.get('path')!;
  const group = values.get('group')!;
  const orderSource = values.get('order')!;
  if (!/^\/docs(?:\/[a-z0-9-]+)*$/u.test(path)) throw new Error(`${sourceName}: invalid documentation path ${path}`);
  if (!documentationGroupIds.has(group as DocumentationGroupId)) {
    throw new Error(`${sourceName}: invalid documentation group ${group}`);
  }
  if (!/^[1-9]\d*$/u.test(orderSource)) throw new Error(`${sourceName}: order must be a positive integer`);
  return {
    path: path as DocumentationPath,
    title: values.get('title')!,
    description: values.get('description')!,
    group: group as DocumentationGroupId,
    order: Number(orderSource),
  };
}

function parseBlocks(
  sourceName: string,
  body: string,
): {
  readonly blocks: readonly DocumentationBlock[];
  readonly headings: readonly DocumentationHeading[];
} {
  const lines = body.split(/\r?\n/u);
  const blocks: DocumentationBlock[] = [];
  const headings: DocumentationHeading[] = [];
  const headingIds = new Set<string>();
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? '';
    if (line.trim() === '' || /^#\s/u.test(line)) {
      index += 1;
      continue;
    }
    const headingMatch = line.match(/^(#{2,3})\s+(.+)$/u);
    if (headingMatch !== null) {
      const text = headingMatch[2]!.trim();
      const id = slugifyHeading(text);
      if (headingIds.has(id)) throw new Error(`${sourceName}: duplicate heading id "${id}"`);
      headingIds.add(id);
      const heading = { depth: headingMatch[1]!.length as 2 | 3, id, text } as const;
      headings.push(heading);
      blocks.push({ kind: 'heading', ...heading });
      index += 1;
      continue;
    }
    const fenceMatch = line.match(/^```([^\s`]*)\s*$/u);
    if (fenceMatch !== null) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && lines[index] !== '```') {
        code.push(lines[index] ?? '');
        index += 1;
      }
      if (index === lines.length) throw new Error(`${sourceName}: unclosed code fence`);
      blocks.push({ kind: 'code', language: fenceMatch[1] || undefined, value: code.join('\n') });
      index += 1;
      continue;
    }
    if (/^-\s+/u.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^-\s+/u.test(lines[index] ?? '')) {
        items.push((lines[index] ?? '').replace(/^-\s+/u, '').trim());
        index += 1;
      }
      blocks.push({ kind: 'list', items });
      continue;
    }
    const paragraph: string[] = [];
    while (
      index < lines.length &&
      (lines[index] ?? '').trim() !== '' &&
      !/^#{1,3}\s/u.test(lines[index] ?? '') &&
      !/^```/u.test(lines[index] ?? '') &&
      !/^-\s+/u.test(lines[index] ?? '')
    ) {
      paragraph.push((lines[index] ?? '').trim());
      index += 1;
    }
    if (paragraph.length > 0) blocks.push({ kind: 'paragraph', text: paragraph.join(' ') });
  }
  if (headings.length === 0)
    throw new Error(`${sourceName}: at least one level-two or level-three heading is required`);
  return { blocks, headings };
}

function slugifyHeading(value: string): string {
  const slug = value
    .toLowerCase()
    .replaceAll(/[`'’]/gu, '')
    .replaceAll(/[^a-z0-9]+/gu, '-')
    .replaceAll(/(^-|-$)/gu, '');
  if (slug === '') throw new Error(`heading "${value}" does not produce a stable id`);
  return slug;
}

function normalizeSourcePath(sourceName: string): string {
  const normalized = sourceName.replaceAll('\\', '/');
  const contentMarker = '/content/';
  const markerIndex = normalized.lastIndexOf(contentMarker);
  if (markerIndex >= 0) return normalized.slice(markerIndex + contentMarker.length);
  return normalized.replace(/^\.\.\/\.\.\/content\//u, '').replace(/^\//u, '');
}
