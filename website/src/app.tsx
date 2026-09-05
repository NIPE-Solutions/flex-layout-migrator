import { useEffect } from 'react';

import { SiteFooter } from './components/site-footer';
import { SiteHeader } from './components/site-header';
import { documentationRoutes } from './content/docs-navigation';
import { DocsPage } from './pages/docs';
import { HomePage } from './pages/home';
import { LegalPage } from './pages/legal';
import {
  documentationPaths,
  installClientNavigation,
  legalPaths,
  type DocumentationPath,
  type LegalPath,
  useSitePath,
} from './router';
import { siteContent } from './site-content';

export function App() {
  const path = useSitePath();

  useEffect(() => installClientNavigation(), []);
  useEffect(() => updateRouteMetadata(path), [path]);

  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <SiteHeader />
      {path === '/' ? <HomePage /> : null}
      {documentationPaths.includes(path as DocumentationPath) ? <DocsPage path={path as DocumentationPath} /> : null}
      {legalPaths.includes(path as LegalPath) ? <LegalPage path={path as LegalPath} /> : null}
      <SiteFooter />
    </>
  );
}

function updateRouteMetadata(path: string): void {
  const routeUrl = new URL(path, `${siteContent.productionUrl}/`).href;
  const documentationRoute = documentationRoutes.find(route => route.path === path);
  const legalPage = path === '/privacy' || path === '/imprint' ? siteContent.legalPages[path] : undefined;
  const title =
    documentationRoute === undefined
      ? legalPage === undefined
        ? 'Flex Layout Codemod — NIPE Open Source'
        : `${legalPage.heading} — Flex Layout Codemod`
      : `${documentationRoute.title} — Flex Layout Codemod`;
  const description =
    documentationRoute?.description ??
    legalPage?.introduction ??
    'Migrate supported Angular Flex-Layout templates to Tailwind CSS or native CSS with a safety-first codemod.';
  const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  const openGraphUrl = document.querySelector<HTMLMetaElement>('meta[property="og:url"]');
  const descriptionMeta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  const openGraphTitle = document.querySelector<HTMLMetaElement>('meta[property="og:title"]');
  const openGraphDescription = document.querySelector<HTMLMetaElement>('meta[property="og:description"]');
  document.title = title;
  canonical?.setAttribute('href', routeUrl);
  openGraphUrl?.setAttribute('content', routeUrl);
  descriptionMeta?.setAttribute('content', description);
  openGraphTitle?.setAttribute('content', title);
  openGraphDescription?.setAttribute('content', description);
}
