// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from './app';

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
  Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
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

  it('leaves same-page fragment navigation to the browser for native scrolling', () => {
    render(<App />);
    let defaultWasPrevented: boolean | undefined;
    const observeNativeDefault = (event: MouseEvent) => {
      defaultWasPrevented = event.defaultPrevented;
      event.preventDefault();
    };
    window.addEventListener('click', observeNativeDefault, { once: true });

    fireEvent.click(screen.getByRole('link', { name: 'Playground' }));

    expect(defaultWasPrevented).toBe(false);
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
    fireEvent.click(screen.getByRole('link', { name: 'CLI workflow' }));

    window.history.back();

    await waitFor(() => expect(window.location.pathname).toBe('/docs'));
    expect(screen.getByRole('heading', { level: 1, name: 'Migration guide' })).toHaveFocus();
  });

  it.each([
    ['/docs', 'Migration guide'],
    ['/docs/cli', 'CLI workflow'],
    ['/docs/tailwind', 'Tailwind CSS output'],
    ['/docs/native-css', 'Native CSS output'],
    ['/docs/safety', 'Safety and reporting'],
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
});
