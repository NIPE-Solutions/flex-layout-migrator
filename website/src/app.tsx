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

export function App() {
  const path = useSitePath();

  useEffect(() => installClientNavigation(), []);

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
