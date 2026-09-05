import { useSyncExternalStore } from 'react';

import { documentationRoutes } from './content/docs-navigation';
import type { DocumentationPath } from './content/docs-loader';

export type { DocumentationPath } from './content/docs-loader';

export const documentationPaths = Object.freeze(documentationRoutes.map(route => route.path));

export const legalPaths = ['/privacy', '/imprint'] as const;

export type LegalPath = (typeof legalPaths)[number];
export type SitePath = '/' | DocumentationPath | LegalPath;

const sitePaths = new Set<string>(['/', ...documentationPaths, ...legalPaths]);

export function useSitePath(): SitePath {
  return useSyncExternalStore(subscribe, currentPath, () => '/');
}

export function installClientNavigation(): () => void {
  let previousLocation = currentLocation();
  let initialFragmentTimer: ReturnType<typeof setTimeout> | undefined;

  if (window.location.hash !== '') initialFragmentTimer = setTimeout(() => scrollToRouteTarget(), 0);

  function restoreRouteContext(): void {
    const nextLocation = currentLocation();
    if (nextLocation === previousLocation) return;
    previousLocation = nextLocation;
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
    event.preventDefault();
    const destination = `${normalizePath(url.pathname)}${url.search}${url.hash}`;
    if (currentLocation() !== destination) {
      window.history.pushState(null, '', destination);
      window.dispatchEvent(new PopStateEvent('popstate'));
    } else {
      queueMicrotask(() => scrollToRouteTarget());
    }
  }

  document.addEventListener('click', followLink);
  window.addEventListener('popstate', restoreRouteContext);
  return () => {
    if (initialFragmentTimer !== undefined) clearTimeout(initialFragmentTimer);
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

function currentLocation(): string {
  return `${normalizePath(window.location.pathname)}${window.location.search}${window.location.hash}`;
}

function scrollToRouteTarget(): void {
  const fragment = decodeFragment(window.location.hash);
  const fragmentTarget = fragment === '' ? null : document.getElementById(fragment);
  const scrollTarget = fragmentTarget ?? document.querySelector('#main-content h1');
  if (scrollTarget === null) return;

  scrollTarget.scrollIntoView?.({ behavior: 'auto', block: 'start' });
  const focusTarget = scrollTarget.matches('tr')
    ? scrollTarget
    : scrollTarget.matches('h1, h2, h3, h4, h5, h6')
      ? scrollTarget
      : (scrollTarget.querySelector('h1, h2, h3, h4, h5, h6') ?? scrollTarget);
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
