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
  let previousPath = normalizePath(window.location.pathname);

  function restoreRouteContext(): void {
    const nextPath = normalizePath(window.location.pathname);
    if (nextPath === previousPath) return;
    previousPath = nextPath;
    queueMicrotask(() => scrollToRouteTarget());
  }

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
    if (
      url.hash !== '' &&
      normalizePath(url.pathname) === normalizePath(window.location.pathname) &&
      url.search === window.location.search
    ) {
      return;
    }

    event.preventDefault();
    const destination = `${normalizePath(url.pathname)}${url.search}${url.hash}`;
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== destination) {
      window.history.pushState(null, '', destination);
    }
    window.dispatchEvent(new PopStateEvent('popstate'));
  }

  document.addEventListener('click', followLink);
  window.addEventListener('popstate', restoreRouteContext);
  return () => {
    document.removeEventListener('click', followLink);
    window.removeEventListener('popstate', restoreRouteContext);
  };
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

function scrollToRouteTarget(): void {
  const fragment = decodeFragment(window.location.hash);
  const fragmentTarget = fragment === '' ? null : document.getElementById(fragment);
  const scrollTarget = fragmentTarget ?? document.querySelector('#main-content h1');
  if (scrollTarget === null) return;

  scrollTarget.scrollIntoView?.({ behavior: 'auto', block: 'start' });
  const focusTarget = scrollTarget.matches('h1, h2, h3, h4, h5, h6')
    ? scrollTarget
    : scrollTarget.querySelector('h1, h2, h3, h4, h5, h6');
  if (!(focusTarget instanceof HTMLElement)) return;
  if (!focusTarget.hasAttribute('tabindex')) focusTarget.tabIndex = -1;
  focusTarget.focus({ preventScroll: true });
}

function decodeFragment(hash: string): string {
  try {
    return decodeURIComponent(hash.slice(1));
  } catch {
    return hash.slice(1);
  }
}
