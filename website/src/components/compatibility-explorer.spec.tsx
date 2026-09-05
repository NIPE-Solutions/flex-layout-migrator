// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { compatibilityReference } from '../content/compatibility-reference';
import { loadDocumentationPage } from '../content/docs-loader';
import { verifiedExamples } from '../content/example-reference';
import { CompatibilityExplorer, VerifiedExamples } from './compatibility-explorer';
import { DocsLayout } from './docs-layout';

afterEach(cleanup);

describe('CompatibilityExplorer', () => {
  it('filters registry entries by target, family, and status', () => {
    render(<CompatibilityExplorer />);

    fireEvent.change(screen.getByLabelText('Target'), { target: { value: 'css' } });
    fireEvent.change(screen.getByLabelText('Family'), { target: { value: 'grid' } });

    const gridRows = within(screen.getByRole('table', { name: 'Directive compatibility' }))
      .getAllByRole('row')
      .slice(1);
    expect(gridRows).toHaveLength(12);
    for (const row of gridRows) expect(row).toHaveTextContent(/Grid.*Native CSS.*Preserved/iu);

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'limited' } });
    expect(screen.getByText('No directives match these filters.')).toBeVisible();
  });

  it('exposes one stable directive anchor with registry-backed target differences and reference links', () => {
    render(<CompatibilityExplorer />);

    const row = screen.getByRole('row', { name: /gdColumns/iu });
    expect(row).toHaveAttribute('id', 'gdColumns');
    expect(within(row).getByLabelText('Status: Limited').querySelector('[aria-hidden="true"]')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: 'gdColumns' })).toHaveAttribute(
      'href',
      '/docs/compatibility#gdColumns',
    );
    fireEvent.click(within(row).getByText('Details for gdColumns'));

    expect(within(row).getByText(/Tailwind CSS: Limited/iu)).toBeVisible();
    expect(within(row).getByText(/Native CSS: Preserved/iu)).toBeVisible();
    expect(within(row).getByRole('link', { name: 'Grid directives and preserved inputs' })).toHaveAttribute(
      'href',
      '/docs/examples#grid',
    );
    expect(within(row).getByRole('link', { name: 'dynamic-binding' })).toHaveAttribute(
      'href',
      '/docs/diagnostics#dynamic-binding',
    );
    expect(document.querySelectorAll('[id="gdColumns"]')).toHaveLength(1);
  });

  it('renders every exact verified example from the shared registry', () => {
    render(<VerifiedExamples />);

    for (const example of verifiedExamples) {
      const region = screen.getByRole('region', { name: example.title });
      expect(region).toHaveAttribute('id', example.id);
      expect(region.querySelector('[data-example-input]')?.textContent).toBe(example.input.source);
      expect(region.querySelector('[data-example-output]')?.textContent).toBe(example.expectedOutput);
      expect(within(region).getAllByRole('listitem')).toHaveLength(example.expectedResults.length);
    }
  });

  it('publishes registry-backed compatibility and example components through Markdown routes', () => {
    render(<DocsLayout page={loadDocumentationPage('/docs/compatibility')} />);
    expect(screen.getByRole('table', { name: 'Directive compatibility' })).toBeVisible();
    expect(screen.getAllByRole('row')).toHaveLength(compatibilityReference.length + 1);

    cleanup();
    render(<DocsLayout page={loadDocumentationPage('/docs/examples')} />);
    for (const example of verifiedExamples) expect(screen.getByRole('region', { name: example.title })).toBeVisible();
  });
});
