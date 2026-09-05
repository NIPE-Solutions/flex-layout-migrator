import { useEffect } from 'react';

import { SiteFooter } from './components/site-footer';
import { SiteHeader } from './components/site-header';
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
  const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  const openGraphUrl = document.querySelector<HTMLMetaElement>('meta[property="og:url"]');
  canonical?.setAttribute('href', routeUrl);
  openGraphUrl?.setAttribute('content', routeUrl);
}
