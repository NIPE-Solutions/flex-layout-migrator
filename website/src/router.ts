import { useSyncExternalStore } from 'react';

export const documentationPaths = [
  '/docs',
  '/docs/cli',
  '/docs/tailwind',
  '/docs/native-css',
  '/docs/safety',
  '/docs/troubleshooting',
] as const;

export const legalPaths = ['/privacy', '/imprint'] as const;

export type DocumentationPath = (typeof documentationPaths)[number];
export type LegalPath = (typeof legalPaths)[number];
export type SitePath = '/' | DocumentationPath | LegalPath;

const sitePaths = new Set<string>(['/', ...documentationPaths, ...legalPaths]);

export function useSitePath(): SitePath {
  return useSyncExternalStore(subscribe, currentPath, () => '/');
}

export function installClientNavigation(): () => void {
  function followLink(event: MouseEvent): void {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest('a');
    if (link === null || link.target !== '' || link.hasAttribute('download')) return;

    const url = new URL(link.href, window.location.href);
    if (url.origin !== window.location.origin || !sitePaths.has(normalizePath(url.pathname))) return;

    event.preventDefault();
    const destination = `${normalizePath(url.pathname)}${url.search}${url.hash}`;
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== destination) {
      window.history.pushState(null, '', destination);
    }
    window.dispatchEvent(new PopStateEvent('popstate'));
  }

  document.addEventListener('click', followLink);
  return () => document.removeEventListener('click', followLink);
}

function subscribe(notify: () => void): () => void {
  window.addEventListener('popstate', notify);
  return () => window.removeEventListener('popstate', notify);
}

function currentPath(): SitePath {
  const path = normalizePath(window.location.pathname);
  return sitePaths.has(path) ? (path as SitePath) : '/';
}

function normalizePath(path: string): string {
  return path.length > 1 ? path.replace(/\/+$/u, '') : path;
}
