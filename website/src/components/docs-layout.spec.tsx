// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { loadDocumentationPage } from '../content/docs-loader';
import { DocsLayout } from './docs-layout';

afterEach(cleanup);

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
});
