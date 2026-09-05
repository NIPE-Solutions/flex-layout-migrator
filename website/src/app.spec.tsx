// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from './app';

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
  document.head.querySelectorAll('[data-route-metadata-test]').forEach(element => element.remove());
  Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
  Reflect.deleteProperty(navigator, 'clipboard');
});

describe('documentation website shell', () => {
  it('connects the product introduction to its install and project destinations', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Migrate Angular Flex-Layout with confidence.',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('npm install --save-dev --save-exact @nipe-solutions/flex-layout-codemod@beta'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View on GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/NIPE-Solutions/flex-layout-migrator',
    );
    expect(screen.getByRole('link', { name: 'View on npm' })).toHaveAttribute(
      'href',
      'https://www.npmjs.com/package/@nipe-solutions/flex-layout-codemod',
    );
  });

  it('keeps the NIPE family destination in both global landmarks', () => {
    render(<App />);

    const familyUrl = 'https://opensource.nipesolutions.com';
    expect(
      within(screen.getByRole('banner')).getByRole('link', {
        name: 'NIPE Open Source',
      }),
    ).toHaveAttribute('href', familyUrl);
    expect(
      within(screen.getByRole('contentinfo')).getByRole('link', {
        name: 'NIPE Open Source',
      }),
    ).toHaveAttribute('href', familyUrl);
  });

  it('navigates from the home page to documentation without a page load', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('link', { name: 'Read the documentation' }));

    expect(window.location.pathname).toBe('/docs');
    expect(screen.getByRole('heading', { level: 1, name: 'Migration guide' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Documentation' })).toBeInTheDocument();
  });

  it('scrolls to and focuses a same-page fragment target', async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
    render(<App />);

    fireEvent.click(screen.getByRole('link', { name: 'Playground' }));

    await waitFor(() => expect(window.location.hash).toBe('#playground'));
    expect(screen.getByRole('heading', { name: 'Preview one template in your browser.' })).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });
  });

  it.each([
    ['/docs/diagnostics#dynamic-binding', 'dynamic-binding'],
    ['/docs/compatibility#gdColumns', 'gdColumns'],
  ])('restores the exact initial fragment target for %s', async (url, targetId) => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
    window.history.replaceState(null, '', url);

    render(<App />);

    const target = await waitFor(() => {
      const element = document.getElementById(targetId);
      expect(element).not.toBeNull();
      expect(element).toHaveFocus();
      return element!;
    });
    expect(target).toHaveAttribute('tabindex', '-1');
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });
  });

  it('does not steal focus on an initial documentation route without a fragment', async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
    window.history.replaceState(null, '', '/docs/diagnostics');

    render(<App />);

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Diagnostics' })).toBeVisible());
    expect(document.activeElement).toBe(document.body);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('scrolls to and focuses the new heading after a client-side route transition', async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
    render(<App />);

    expect(screen.getByRole('heading', { level: 1 })).not.toHaveFocus();
    expect(scrollIntoView).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('link', { name: 'Read the documentation' }));

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Migration guide' })).toHaveFocus());
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });
  });

  it('keeps back navigation in the SPA history and restores heading context', async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
    render(<App />);
    fireEvent.click(screen.getByRole('link', { name: 'Read the documentation' }));
    fireEvent.click(
      within(screen.getByRole('navigation', { name: 'Documentation' })).getByRole('link', { name: 'CLI reference' }),
    );

    window.history.back();

    await waitFor(() => expect(window.location.pathname).toBe('/docs'));
    expect(screen.getByRole('heading', { level: 1, name: 'Migration guide' })).toHaveFocus();
  });

  it.each([
    ['/docs', 'Migration guide'],
    ['/docs/cli', 'CLI reference'],
    ['/docs/tailwind', 'Tailwind CSS'],
    ['/docs/native-css', 'Native CSS'],
    ['/docs/safety', 'Safety model'],
    ['/docs/troubleshooting', 'Troubleshooting'],
    ['/privacy', 'Privacy'],
    ['/imprint', 'Imprint'],
  ])('renders the client-side route %s', (path, heading) => {
    window.history.replaceState(null, '', path);

    render(<App />);

    expect(screen.getByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
    expect(within(screen.getByRole('banner')).getByRole('link', { name: 'NIPE Open Source' })).toHaveAttribute(
      'href',
      'https://opensource.nipesolutions.com',
    );
  });

  it('publishes route-aware canonical and Open Graph URLs after a direct deep link', async () => {
    const canonical = document.createElement('link');
    canonical.rel = 'canonical';
    canonical.href = 'https://angular-flex-layout-codemod.nipesolutions.com/';
    canonical.dataset.routeMetadataTest = '';
    document.head.append(canonical);
    const openGraphUrl = document.createElement('meta');
    openGraphUrl.setAttribute('property', 'og:url');
    openGraphUrl.content = 'https://angular-flex-layout-codemod.nipesolutions.com/';
    openGraphUrl.dataset.routeMetadataTest = '';
    document.head.append(openGraphUrl);
    const description = document.createElement('meta');
    description.name = 'description';
    description.dataset.routeMetadataTest = '';
    document.head.append(description);
    const openGraphTitle = document.createElement('meta');
    openGraphTitle.setAttribute('property', 'og:title');
    openGraphTitle.dataset.routeMetadataTest = '';
    document.head.append(openGraphTitle);
    const openGraphDescription = document.createElement('meta');
    openGraphDescription.setAttribute('property', 'og:description');
    openGraphDescription.dataset.routeMetadataTest = '';
    document.head.append(openGraphDescription);
    window.history.replaceState(null, '', '/docs/native-css');

    render(<App />);

    await waitFor(() =>
      expect(canonical).toHaveAttribute(
        'href',
        'https://angular-flex-layout-codemod.nipesolutions.com/docs/native-css',
      ),
    );
    expect(openGraphUrl).toHaveAttribute(
      'content',
      'https://angular-flex-layout-codemod.nipesolutions.com/docs/native-css',
    );
    expect(document.title).toBe('Native CSS — Flex Layout Codemod');
    expect(description.content).toBe(
      'Generate deterministic template classes and a bounded, tool-owned stylesheet for supported Flex semantics.',
    );
    expect(openGraphTitle.content).toBe('Native CSS — Flex Layout Codemod');
    expect(openGraphDescription.content).toBe(description.content);
  });

  it('renders and copies the published large-codebase checklist from its Markdown route', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    window.history.replaceState(null, '', '/docs/large-codebase');

    render(<App />);

    const checklist = screen.getByRole('region', { name: 'Migration checklist' });
    expect(within(checklist).getByText('Tool behavior')).toBeVisible();
    expect(within(checklist).getByText('Recommended practice')).toBeVisible();
    fireEvent.click(within(checklist).getByRole('button', { name: /copy migration checklist/iu }));

    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText.mock.calls[0]?.[0]).toContain('Tool behavior');
    expect(writeText.mock.calls[0]?.[0]).toContain('Recommended practice');
    expect(await within(checklist).findByText('Migration checklist copied to clipboard.')).toHaveAttribute(
      'aria-live',
      'polite',
    );
  });
});
