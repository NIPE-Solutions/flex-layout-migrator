// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { MigrationPlanHero } from './migration-plan-hero';
import { SourceDiff } from './source-diff';
import { StatusLabel } from './status-label';

afterEach(cleanup);

describe('migration plan hero', () => {
  it('uses the verified fixture and the real preview engine when the target changes', () => {
    render(<MigrationPlanHero />);

    expect(screen.getByText('Plan first. Review unresolved cases. Write only when you are ready.')).toBeVisible();
    expect(screen.getByText('Example migration plan')).toBeVisible();
    expect(screen.getByText('native-css-flex-target-boundary.html')).toBeVisible();
    expect(screen.getByRole('list', { name: 'Migration workflow' })).toHaveTextContent(
      'SourceAnalyzePlanReviewWriteVerify',
    );
    expect(screen.getAllByLabelText('Status: Review')).toHaveLength(2);
    expect(screen.getAllByText('Preserved in source')).toHaveLength(2);
    expect(screen.queryByLabelText('Migration CSS output')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'Native CSS' }));

    const expectedHtmlFixture = `<div fxLayout.handset="row"></div>
<div fxLayout.cinema="column"></div>
<div class="flex flm-5db098b5a4e638fdd1aff69e13d53ea10eb01e6c58577e5ecdf136b90eaee103"></div>
`;
    const expectedCssFixture = `/* flex-layout-codemod:start schema=1 */
/* flex-layout-codemod:rule id=5db098b5a4e638fdd1aff69e13d53ea10eb01e6c58577e5ecdf136b90eaee103 */
.flm-5db098b5a4e638fdd1aff69e13d53ea10eb01e6c58577e5ecdf136b90eaee103 {
  display: flex;
  box-sizing: border-box;
  flex-direction: row;
}
/* flex-layout-codemod:end */`;
    const output = screen.getByRole('region', { name: 'Migration output' });
    expect(within(output).getByText('HTML output')).toBeVisible();
    expect(within(output).getByText('CSS output')).toBeVisible();
    expect(screen.getByLabelText('Migration HTML output')).toHaveTextContent(expectedHtmlFixture, {
      normalizeWhitespace: false,
    });
    expect(screen.getByLabelText('Migration CSS output')).toHaveTextContent(expectedCssFixture, {
      normalizeWhitespace: false,
    });
    expect(screen.getAllByText('Native CSS')).toHaveLength(2);
    expect(screen.getByText('3 directives analyzed')).toBeVisible();
    expect(screen.getByText('No project files written')).toBeVisible();
    expect(screen.getAllByLabelText('Status: Unsupported')).toHaveLength(2);
    expect(screen.getAllByText('Preserved in source')).toHaveLength(2);
    expect(screen.getByText('Converted')).toBeVisible();
    expect(screen.getByText('fxLayout')).toBeVisible();
    expect(screen.getAllByRole('link', { name: 'target-unsupported' })).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: 'target-unsupported' })[0]).toHaveAttribute(
      'href',
      '/docs/diagnostics#target-unsupported',
    );
  });

  it('labels status with visible text and an icon instead of color alone', () => {
    render(
      <div>
        <StatusLabel status="converted" />
        <StatusLabel status="review" />
        <StatusLabel status="preserved" />
        <StatusLabel status="unsupported" />
        <StatusLabel status="invalid" />
        <StatusLabel status="informational" />
      </div>,
    );

    for (const label of ['Converted', 'Review', 'Preserved', 'Unsupported', 'Invalid', 'Informational']) {
      const status = screen.getByLabelText(`Status: ${label}`);
      expect(status).toHaveTextContent(label);
      const icon = status.querySelector('.status-label__icon');
      expect(icon).toHaveAttribute('aria-hidden', 'true');
      expect(icon).not.toHaveTextContent(/^\s*$/u);
    }
  });

  it('gives every diff line a semantic label and a literal marker', () => {
    render(
      <SourceDiff
        label="Fixture changes"
        lines={[
          { kind: 'removed', value: '<div fxLayout="row">' },
          { kind: 'added', value: '<div class="flex flex-row box-border">' },
          { kind: 'preserved', value: '<div [fxFlex]="basis">' },
        ]}
      />,
    );

    const diff = screen.getByRole('figure', { name: 'Fixture changes' });
    const scroller = within(diff).getByRole('list', { name: 'Fixture changes lines' });
    expect(scroller).toHaveAttribute('tabindex', '0');
    scroller.focus();
    expect(scroller).toHaveFocus();
    expect(within(diff).getByLabelText('Removed line: <div fxLayout="row">')).toHaveTextContent(
      '-<div fxLayout="row">',
    );
    expect(within(diff).getByLabelText('Added line: <div class="flex flex-row box-border">')).toHaveTextContent(
      '+<div class="flex flex-row box-border">',
    );
    expect(within(diff).getByLabelText('Preserved line: <div [fxFlex]="basis">')).toHaveTextContent(
      '=<div [fxFlex]="basis">',
    );
  });
});
