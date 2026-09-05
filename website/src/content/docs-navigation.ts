import { deepFreeze } from './public-contract';
import {
  documentationPages,
  type DocumentationGroupId,
  type DocumentationPage,
  type DocumentationPath,
} from './docs-loader';

export interface DocumentationRoute {
  readonly path: DocumentationPath;
  readonly title: string;
  readonly description: string;
  readonly group: DocumentationGroupId;
  readonly order: number;
  readonly editUrl: string;
}

export interface DocumentationGroup {
  readonly id: DocumentationGroupId;
  readonly label: string;
  readonly routes: readonly DocumentationRoute[];
}

const groupDefinitions = [
  { id: 'start', label: 'Start' },
  { id: 'targets', label: 'Migration Targets' },
  { id: 'compatibility', label: 'Compatibility' },
  { id: 'safety', label: 'Safety & Review' },
  { id: 'reports', label: 'Reports & Automation' },
  { id: 'reference', label: 'Reference' },
  { id: 'project', label: 'Project' },
] as const satisfies readonly { readonly id: DocumentationGroupId; readonly label: string }[];

export const legacyDocumentationPaths = [
  '/docs',
  '/docs/cli',
  '/docs/tailwind',
  '/docs/native-css',
  '/docs/safety',
  '/docs/troubleshooting',
] as const;

export const documentationGroups = buildDocumentationGroups(documentationPages);
export const documentationRoutes = deepFreeze(documentationGroups.flatMap(group => group.routes));

export function buildDocumentationGroups(pages: readonly DocumentationPage[]): readonly DocumentationGroup[] {
  const groups = groupDefinitions.map(definition => {
    const groupPages = pages
      .filter(page => page.group === definition.id)
      .sort((left, right) => left.order - right.order || left.path.localeCompare(right.path));
    if (groupPages.length === 0) throw new Error(`documentation group ${definition.id} has no routes`);
    const orders = new Set<number>();
    for (const page of groupPages) {
      if (orders.has(page.order))
        throw new Error(`duplicate order ${page.order} in documentation group ${definition.id}`);
      orders.add(page.order);
    }
    return {
      ...definition,
      routes: groupPages.map(({ path, title, description, group, order, editUrl }) => ({
        path,
        title,
        description,
        group,
        order,
        editUrl,
      })),
    };
  });
  const routePaths = new Set(groups.flatMap(group => group.routes.map(route => route.path)));
  for (const path of legacyDocumentationPaths) {
    if (!routePaths.has(path)) throw new Error(`legacy documentation path ${path} must remain an exact content route`);
  }
  return deepFreeze(groups);
}

export function getDocumentationNeighbors(path: string): {
  readonly previous: DocumentationRoute | undefined;
  readonly next: DocumentationRoute | undefined;
} {
  const activeIndex = documentationRoutes.findIndex(route => route.path === path);
  if (activeIndex < 0) throw new Error(`active documentation route ${path} is not registered`);
  return {
    previous: documentationRoutes[activeIndex - 1],
    next: documentationRoutes[activeIndex + 1],
  };
}
