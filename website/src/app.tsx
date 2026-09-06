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
      {path === '/404' ? (
        <main id="main-content" className="site-container not-found">
          <h1>404 — Page not found</h1>
          <p>This address does not match a page on this site.</p>
          <p>
            <a className="action-link" href="/">
              Go to homepage
            </a>{' '}
            <a className="action-link" href="/docs">
              Read the documentation
            </a>
          </p>
        </main>
      ) : null}
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
        ? siteContent.metadata.title
        : `${legalPage.heading} — Angular Flex-Layout Codemod`
      : `${documentationRoute.title} — Angular Flex-Layout Codemod`;
  const description = documentationRoute?.description ?? legalPage?.introduction ?? siteContent.metadata.description;
  const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  const openGraphUrl = document.querySelector<HTMLMetaElement>('meta[property="og:url"]');
  const descriptionMeta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  const openGraphTitle = document.querySelector<HTMLMetaElement>('meta[property="og:title"]');
  const openGraphDescription = document.querySelector<HTMLMetaElement>('meta[property="og:description"]');
  const twitterTitle = document.querySelector<HTMLMetaElement>('meta[name="twitter:title"]');
  const twitterDescription = document.querySelector<HTMLMetaElement>('meta[name="twitter:description"]');
  document.title = path === '/404' ? '404 — Page not found' : title;
  canonical?.setAttribute('href', routeUrl);
  openGraphUrl?.setAttribute('content', routeUrl);
  descriptionMeta?.setAttribute('content', description);
  openGraphTitle?.setAttribute('content', title);
  openGraphDescription?.setAttribute('content', description);
  twitterTitle?.setAttribute('content', title);
  twitterDescription?.setAttribute('content', description);
}
