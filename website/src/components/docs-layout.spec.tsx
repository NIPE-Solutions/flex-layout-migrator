// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadDocumentationPage } from '../content/docs-loader';
import { diagnosticReference } from '../content/diagnostic-reference';
import { reportReference } from '../content/report-reference';
import { App } from '../app';
import { DocsLayout } from './docs-layout';

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'clipboard');
});

describe('DocsLayout', () => {
  it('marks the active page in grouped desktop and mobile navigation', () => {
    render(<DocsLayout page={loadDocumentationPage('/docs/native-css')} />);

    const desktop = screen.getByRole('navigation', { name: 'Documentation' });
    const mobile = screen.getByRole('navigation', { name: 'Mobile documentation' });
    expect(within(desktop).getByRole('link', { name: 'Native CSS' })).toHaveAttribute('aria-current', 'page');
    expect(within(mobile).getByRole('link', { name: 'Native CSS' })).toHaveAttribute('aria-current', 'page');
    expect(within(mobile).getByText('Migration Targets').closest('details')).toHaveAttribute('open');
    expect(within(mobile).getByText('Start').closest('details')).not.toHaveAttribute('open');
  });

  it('renders section jumps, stable heading ids, edit link, and adjacent pages', () => {
    const page = loadDocumentationPage('/docs/native-css');
    render(<DocsLayout page={page} />);

    const jumps = screen.getByRole('navigation', { name: 'On this page' });
    for (const heading of page.headings) {
      expect(within(jumps).getByRole('link', { name: heading.text })).toHaveAttribute('href', `#${heading.id}`);
      expect(screen.getByRole('heading', { name: heading.text })).toHaveAttribute('id', heading.id);
    }
    expect(screen.getByRole('link', { name: 'Edit this page on GitHub' })).toHaveAttribute('href', page.editUrl);
    expect(screen.getByRole('link', { name: /previous:/iu })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /next:/iu })).toBeInTheDocument();
  });

  it('reopens the active mobile group after next-page navigation within that group', async () => {
    window.history.replaceState(null, '', '/docs/tailwind');
    render(<App />);

    const mobile = screen.getByRole('navigation', { name: 'Mobile documentation' });
    const activeSummary = within(mobile).getByText('Migration Targets');
    const activeDetails = activeSummary.closest('details');
    expect(activeDetails).toHaveAttribute('open');

    activeDetails!.open = false;
    fireEvent(activeDetails!, new Event('toggle'));
    expect(activeDetails).not.toHaveAttribute('open');
    fireEvent.click(screen.getByRole('link', { name: 'Next: Native CSS' }));

    await waitFor(() => expect(window.location.pathname).toBe('/docs/native-css'));
    await waitFor(() =>
      expect(
        within(screen.getByRole('navigation', { name: 'Mobile documentation' }))
          .getByText('Migration Targets')
          .closest('details'),
      ).toHaveAttribute('open'),
    );
    const currentMobile = screen.getByRole('navigation', { name: 'Mobile documentation' });
    expect(within(currentMobile).getByRole('link', { name: 'Native CSS' })).toBeVisible();
    expect(within(currentMobile).getByRole('link', { name: 'Native CSS' })).toHaveAttribute('aria-current', 'page');
  });

  it('renders and copies the registry report example from the Markdown content directive', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<DocsLayout page={loadDocumentationPage('/docs/reports')} />);

    const reference = reportReference.examples.find(entry => entry.id === 'plan')!;
    const serialized = `${JSON.stringify(reference.value, null, 2)}\n`;
    const example = screen.getByRole('region', { name: 'Plan report example' });
    expect(within(example).getByText('Schema version')).toBeVisible();
    expect(within(example).getByText(String(reference.value.schemaVersion))).toBeVisible();
    expect(example.querySelector('pre code')?.textContent).toBe(serialized);

    fireEvent.click(within(example).getByRole('button', { name: 'Copy Plan report example' }));

    expect(writeText).toHaveBeenCalledWith(serialized);
    expect(await within(example).findByText('Plan report example copied to clipboard.')).toHaveAttribute(
      'aria-live',
      'polite',
    );
  });

  it('gives every published diagnostic link one stable heading target', () => {
    render(<DocsLayout page={loadDocumentationPage('/docs/diagnostics')} />);

    const publishedCodes = ['dynamic-binding', 'target-unsupported'] as const;
    const targetIds = new Set<string>();
    for (const code of publishedCodes) {
      const reference = diagnosticReference.find(entry => entry.code === code)!;
      const callout = screen.getByRole('note', { name: code });
      const heading = within(callout).getByRole('heading', { name: code });
      const href = within(callout).getByRole('link', { name: code }).getAttribute('href');

      expect(href).toBe(`/docs/diagnostics#${code}`);
      const targetId = href!.slice(href!.indexOf('#') + 1);
      const targets = document.querySelectorAll(`[id="${targetId}"]`);
      expect(targets).toHaveLength(1);
      expect(targets[0]).toBe(heading);
      expect(callout).toHaveAttribute('aria-labelledby', targetId);
      targetIds.add(targetId);
      expect(within(callout).getByText(reference.meaning)).toBeVisible();
      for (const resolution of reference.resolution) expect(within(callout).getByText(resolution)).toBeVisible();
    }
    expect(targetIds.size).toBe(publishedCodes.length);
  });
});
