// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { loadDocumentationPage } from '../content/docs-loader';
import { diagnosticReference } from '../content/diagnostic-reference';
import { DiagnosticReference } from './diagnostic-reference';
import { DocsLayout } from './docs-layout';

afterEach(cleanup);

describe('DiagnosticReference', () => {
  it('searches code, message, and family with a native text input', () => {
    render(<DiagnosticReference />);

    fireEvent.change(screen.getByLabelText('Search diagnostics'), { target: { value: 'runtime values' } });
    expect(screen.getByRole('article', { name: 'dynamic-binding' })).toBeVisible();
    expect(screen.queryByRole('article', { name: 'class-conflict' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Search diagnostics'), { target: { value: 'selected target' } });
    expect(screen.getByRole('article', { name: 'target-unsupported' })).toBeVisible();

    fireEvent.change(screen.getByLabelText('Search diagnostics'), { target: { value: 'template-parse-error' } });
    expect(screen.getByRole('article', { name: 'template-parse-error' })).toBeVisible();
  });

  it('covers every conversion and parse diagnostic with action, preservation, and rerun guidance', () => {
    render(<DiagnosticReference />);

    expect(diagnosticReference).toHaveLength(15);
    for (const diagnostic of diagnosticReference) {
      const entry = screen.getByRole('article', { name: diagnostic.code });
      const heading = within(entry).getByRole('heading', { name: diagnostic.code });
      expect(heading).toHaveAttribute('id', diagnostic.code);
      expect(within(entry).getByRole('link', { name: diagnostic.code })).toHaveAttribute(
        'href',
        `/docs/diagnostics#${diagnostic.code}`,
      );
      expect(within(entry).getByText(diagnostic.meaning)).toBeVisible();
      expect(within(entry).getByText(diagnostic.unsafeToGuess)).toBeVisible();
      for (const resolution of diagnostic.resolution) expect(within(entry).getByText(resolution)).toBeVisible();
      expect(within(entry).getByText(/source remains unchanged/iu)).toBeVisible();
      expect(
        within(entry).getByText(/rerun|manual migration|report a minimal reproduction/iu, { selector: 'p' }),
      ).toBeVisible();
      expect(document.querySelectorAll(`[id="${diagnostic.code}"]`)).toHaveLength(1);
    }
  });

  it('publishes all stable diagnostic anchors once on the diagnostics route', () => {
    render(<DocsLayout page={loadDocumentationPage('/docs/diagnostics')} />);

    for (const diagnostic of diagnosticReference) {
      const link = screen.getByRole('link', { name: diagnostic.code });
      expect(link).toHaveAttribute('href', `/docs/diagnostics#${diagnostic.code}`);
      expect(document.querySelectorAll(`[id="${diagnostic.code}"]`)).toHaveLength(1);
    }
  });
});
