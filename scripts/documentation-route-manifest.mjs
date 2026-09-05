import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const requiredFields = ['path', 'title', 'description', 'group', 'order'];
const groupOrder = new Map([
  ['start', 0],
  ['targets', 1],
  ['compatibility', 2],
  ['safety', 3],
  ['reports', 4],
  ['reference', 5],
  ['project', 6],
]);

export async function readDocumentationRouteManifest(projectRoot) {
  const contentRoot = path.join(projectRoot, 'website', 'content');
  const files = await findMarkdownFiles(contentRoot);
  const routes = await Promise.all(
    files.map(async file => parseRouteMetadata(path.relative(contentRoot, file), await readFile(file, 'utf8'))),
  );
  const paths = new Set();
  const ordersByGroup = new Map();
  for (const route of routes) {
    if (paths.has(route.path)) throw new Error(`duplicate documentation path ${route.path}`);
    paths.add(route.path);
    const groupOrders = ordersByGroup.get(route.group) ?? new Set();
    if (groupOrders.has(route.order)) throw new Error(`duplicate order ${route.order} in group ${route.group}`);
    groupOrders.add(route.order);
    ordersByGroup.set(route.group, groupOrders);
  }
  return routes.sort(
    (left, right) => groupOrder.get(left.group) - groupOrder.get(right.group) || left.order - right.order,
  );
}

export async function readSiteRouteManifest(projectRoot) {
  const documentation = await readDocumentationRouteManifest(projectRoot);
  return [
    {
      path: '/',
      title: 'Flex Layout Codemod — NIPE Open Source',
      description:
        'Migrate supported Angular Flex-Layout templates to Tailwind CSS or native CSS with a safety-first codemod.',
    },
    ...documentation.map(route => ({
      path: route.path,
      title: `${route.title} — Flex Layout Codemod`,
      description: route.description,
    })),
    {
      path: '/privacy',
      title: 'Privacy — Flex Layout Codemod',
      description: 'The template playground is designed as a local, in-browser preview.',
    },
    {
      path: '/imprint',
      title: 'Imprint — Flex Layout Codemod',
      description: 'Project and publisher information for Flex Layout Codemod.',
    },
  ];
}

async function findMarkdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(entry => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return findMarkdownFiles(entryPath);
      return entry.isFile() && entry.name.endsWith('.md') ? [entryPath] : [];
    }),
  );
  return nested.flat().sort();
}

function parseRouteMetadata(sourcePath, source) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]+)$/u);
  if (match === null || (match[2] ?? '').trim() === '') {
    throw new Error(`${sourcePath}: expected front matter and a non-empty Markdown body`);
  }
  const values = new Map();
  for (const line of (match[1] ?? '').split(/\r?\n/u)) {
    if (line.trim() === '') continue;
    const separator = line.indexOf(':');
    if (separator <= 0) throw new Error(`${sourcePath}: invalid front matter line ${line}`);
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (!requiredFields.includes(key)) throw new Error(`${sourcePath}: unknown front matter field ${key}`);
    if (values.has(key)) throw new Error(`${sourcePath}: duplicate front matter field ${key}`);
    values.set(key, value);
  }
  for (const field of requiredFields) {
    if (!values.has(field) || values.get(field) === '')
      throw new Error(`${sourcePath}: missing front matter field ${field}`);
  }
  const routePath = values.get('path');
  const group = values.get('group');
  const order = Number(values.get('order'));
  if (!/^\/docs(?:\/[a-z0-9-]+)*$/u.test(routePath)) throw new Error(`${sourcePath}: invalid route path ${routePath}`);
  if (!groupOrder.has(group)) throw new Error(`${sourcePath}: invalid documentation group ${group}`);
  if (!Number.isInteger(order) || order <= 0) throw new Error(`${sourcePath}: order must be a positive integer`);
  return {
    path: routePath,
    title: values.get('title'),
    description: values.get('description'),
    group,
    order,
    sourcePath,
  };
}
