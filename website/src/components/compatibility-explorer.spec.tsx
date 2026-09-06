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

  it('shows only Native CSS evidence and diagnostics for Grid and visibility boundaries', () => {
    render(<CompatibilityExplorer />);
    fireEvent.change(screen.getByLabelText('Target'), { target: { value: 'css' } });
    fireEvent.change(screen.getByLabelText('Family'), { target: { value: 'grid' } });

    const grid = screen.getByRole('row', { name: /gdColumns/iu });
    fireEvent.click(within(grid).getByText('Details for gdColumns'));
    expect(within(grid).getByText('Native CSS does not automatically convert Grid directives.')).toBeVisible();
    expect(within(grid).getByRole('link', { name: 'Native CSS target boundaries' })).toHaveAttribute(
      'href',
      '/docs/examples#native-css-boundaries',
    );
    expect(within(grid).queryByRole('link', { name: 'Grid directives and preserved inputs' })).not.toBeInTheDocument();
    expect(diagnosticLinkNames(grid)).toEqual(['target-unsupported']);

    fireEvent.change(screen.getByLabelText('Family'), { target: { value: 'visibility' } });
    const visibility = screen.getByRole('row', { name: /fxHide/iu });
    fireEvent.click(within(visibility).getByText('Details for fxHide'));
    expect(
      within(visibility).getByText('Native CSS does not automatically convert visibility directives.'),
    ).toBeVisible();
    expect(within(visibility).getByRole('link', { name: 'Native CSS target boundaries' })).toBeVisible();
    expect(diagnosticLinkNames(visibility)).toEqual(['target-unsupported']);
  });

  it('keeps responsive class and style details target-exact', () => {
    render(<CompatibilityExplorer />);
    fireEvent.change(screen.getByLabelText('Family'), { target: { value: 'responsive-class-style' } });

    const ngClass = compatibilityRow('ngClass');
    fireEvent.click(within(ngClass).getByText('Details for ngClass'));
    expect(within(ngClass).getByText(/complete literal responsive families whose every token/iu)).toBeVisible();
    expect(within(ngClass).getByRole('link', { name: 'Responsive class and style' })).toHaveAttribute(
      'href',
      '/docs/examples#responsive-class-style',
    );
    expect(diagnosticLinkNames(ngClass)).toEqual([
      'bound-class',
      'class-conflict',
      'breakpoint-unverified',
      'custom-breakpoint',
      'dynamic-binding',
      'context-unverified',
      'responsive-precedence-unverified',
      'semantic-unsupported',
      'tailwind-candidate-unverified',
    ]);

    const ngStyle = compatibilityRow('ngStyle');
    fireEvent.click(within(ngStyle).getByText('Details for ngStyle'));
    expect(within(ngStyle).getByText(/sanitizer-safe declaration lists/iu)).toBeVisible();
    expect(diagnosticLinkNames(ngStyle)).toEqual([
      'bound-class',
      'class-conflict',
      'breakpoint-unverified',
      'custom-breakpoint',
      'dynamic-binding',
      'context-unverified',
      'responsive-precedence-unverified',
      'semantic-unsupported',
      'style-value-unverified',
    ]);

    fireEvent.change(screen.getByLabelText('Target'), { target: { value: 'css' } });
    expect(
      within(compatibilityRow('ngClass')).queryByRole('link', { name: 'Responsive class and style' }),
    ).not.toBeInTheDocument();
  });

  it('does not attach unrelated examples to responsive images', () => {
    render(<CompatibilityExplorer />);
    fireEvent.change(screen.getByLabelText('Family'), { target: { value: 'images' } });

    const image = screen.getByRole('row', { name: /imgSrc/iu });
    fireEvent.click(within(image).getByText('Details for imgSrc'));
    expect(within(image).getByText(/separate opt-in responsive-image path/iu)).toBeVisible();
    expect(
      within(image).getByText('No verified preview example is linked for this target and directive.'),
    ).toBeVisible();
    expect(within(image).queryByRole('link', { name: 'Unresolved inputs remain unchanged' })).not.toBeInTheDocument();
    expect(diagnosticLinkNames(image)).toEqual([
      'target-unsupported',
      'dynamic-binding',
      'invalid-value',
      'context-unverified',
      'custom-breakpoint',
      'breakpoint-unverified',
      'responsive-precedence-unverified',
    ]);
  });

  it('documents flex-item atomicity and the bounded fxFill form from structured details', () => {
    render(<CompatibilityExplorer />);

    for (const directive of ['fxGrow', 'fxShrink'] as const) {
      const row = compatibilityRow(directive);
      fireEvent.click(within(row).getByText(`Details for ${directive}`));
      expect(within(row).getByText(new RegExp(`${directive} converts only with fxFlex`, 'iu'))).toBeVisible();
      expect(within(row).getByRole('link', { name: 'Flex-item atomicity' })).toHaveAttribute(
        'href',
        '/docs/examples#flex-item-atomicity',
      );
      expect(diagnosticLinkNames(row)).toEqual([
        'invalid-value',
        'dynamic-binding',
        'context-unverified',
        'responsive-precedence-unverified',
      ]);
    }

    const fill = compatibilityRow('fxFill');
    fireEvent.click(within(fill).getByText('Details for fxFill'));
    expect(within(fill).getByText('Unsuffixed fxFill is the non-responsive alias of fxFlexFill.')).toBeVisible();
    expect(
      within(fill).getByText('This reference does not claim responsive fxFill suffixes as supported.'),
    ).toBeVisible();
    expect(diagnosticLinkNames(fill)).toEqual(['bound-class', 'class-conflict', 'semantic-unsupported']);
  });

  it('links every Native CSS Flex directive only to the exact Native CSS fixture', () => {
    render(<CompatibilityExplorer />);
    fireEvent.change(screen.getByLabelText('Target'), { target: { value: 'css' } });
    fireEvent.change(screen.getByLabelText('Family'), { target: { value: 'flex' } });

    for (const entry of compatibilityReference.filter(candidate => candidate.category === 'flex')) {
      const row = compatibilityRow(entry.id);
      fireEvent.click(within(row).getByText(`Details for ${entry.id}`));
      expect(within(row).getByRole('link', { name: 'Native CSS Flex output' })).toHaveAttribute(
        'href',
        '/docs/examples#native-css-flex',
      );
      expect(within(row).queryByRole('link', { name: 'Static Flex directives' })).not.toBeInTheDocument();
    }
  });

  it('publishes only production-relevant diagnostics for each Native CSS Flex directive', () => {
    const expectedDiagnostics = {
      fxLayout: [
        'bound-class',
        'dynamic-binding',
        'invalid-value',
        'context-unverified',
        'responsive-precedence-unverified',
        'target-unsupported',
      ],
      fxLayoutAlign: [
        'bound-class',
        'dynamic-binding',
        'invalid-value',
        'context-unverified',
        'responsive-precedence-unverified',
        'target-unsupported',
      ],
      fxLayoutGap: [
        'bound-class',
        'dynamic-binding',
        'invalid-value',
        'context-unverified',
        'responsive-precedence-unverified',
        'semantic-unsupported',
        'target-unsupported',
      ],
      fxFlex: [
        'bound-class',
        'dynamic-binding',
        'invalid-value',
        'context-unverified',
        'responsive-precedence-unverified',
        'target-unsupported',
      ],
      fxGrow: [
        'bound-class',
        'dynamic-binding',
        'invalid-value',
        'context-unverified',
        'responsive-precedence-unverified',
        'target-unsupported',
      ],
      fxShrink: [
        'bound-class',
        'dynamic-binding',
        'invalid-value',
        'context-unverified',
        'responsive-precedence-unverified',
        'target-unsupported',
      ],
      fxFlexAlign: [
        'bound-class',
        'dynamic-binding',
        'invalid-value',
        'context-unverified',
        'responsive-precedence-unverified',
        'target-unsupported',
      ],
      fxFlexFill: ['bound-class', 'dynamic-binding', 'context-unverified', 'target-unsupported'],
      fxFill: ['bound-class', 'dynamic-binding', 'context-unverified', 'target-unsupported'],
      fxFlexOffset: [
        'bound-class',
        'dynamic-binding',
        'invalid-value',
        'context-unverified',
        'responsive-precedence-unverified',
        'target-unsupported',
      ],
      fxFlexOrder: [
        'bound-class',
        'dynamic-binding',
        'context-unverified',
        'responsive-precedence-unverified',
        'target-unsupported',
      ],
    } as const;
    render(<CompatibilityExplorer />);
    fireEvent.change(screen.getByLabelText('Target'), { target: { value: 'css' } });
    fireEvent.change(screen.getByLabelText('Family'), { target: { value: 'flex' } });

    for (const [directive, codes] of Object.entries(expectedDiagnostics)) {
      const row = compatibilityRow(directive);
      fireEvent.click(within(row).getByText(`Details for ${directive}`));
      expect(diagnosticLinkNames(row), directive).toEqual(codes);
    }
  });

  it('links fxLayout to the exact Native CSS breakpoint and literal-class regression', () => {
    render(<CompatibilityExplorer />);
    fireEvent.change(screen.getByLabelText('Target'), { target: { value: 'css' } });

    const row = compatibilityRow('fxLayout');
    fireEvent.click(within(row).getByText('Details for fxLayout'));
    expect(within(row).getByRole('link', { name: 'Native CSS Flex target boundary' })).toHaveAttribute(
      'href',
      '/docs/examples#native-css-flex-target-boundary',
    );
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

  it('makes every scrollable verified-example code region keyboard accessible', () => {
    render(<VerifiedExamples />);

    const codeRegions = document.querySelectorAll('.verified-example pre');
    expect(codeRegions.length).toBeGreaterThan(0);
    for (const region of codeRegions) expect(region).toHaveAttribute('tabindex', '0');
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

function diagnosticLinkNames(row: HTMLElement): string[] {
  return within(row)
    .getAllByRole('link')
    .filter(link => link.getAttribute('href')?.startsWith('/docs/diagnostics#'))
    .map(link => link.textContent ?? '');
}

function compatibilityRow(id: string): HTMLElement {
  const row = document.getElementById(id);
  expect(row).not.toBeNull();
  return row!;
}
