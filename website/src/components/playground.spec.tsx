// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Playground } from './playground';

const defaultSource = '<div fxLayout="row" fxLayoutGap="16px"></div>';
const defaultTailwind = '<div class="flex flex-row box-border gap-[16px]"></div>';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'clipboard');
});

describe('migration playground', () => {
  it('keeps editing in memory and migrates only when the user submits', () => {
    const networkRequest = vi.fn();
    vi.stubGlobal('fetch', networkRequest);
    render(<Playground />);

    expect(screen.getByText('Your template never leaves this browser.')).toBeInTheDocument();
    const source = screen.getByRole('textbox', { name: 'Angular template' });
    const editedSource = '<main fxLayout="column"></main>';

    expect(source).toHaveValue(defaultSource);
    expect(screen.getByText('Run a migration to inspect the proposed output.')).toBeInTheDocument();

    fireEvent.change(source, { target: { value: editedSource } });

    expect(screen.queryByText('<main class="flex flex-col box-border"></main>')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Migrate template' }));

    expect(
      within(screen.getByRole('tabpanel', { name: 'HTML' })).getByText(
        '<main class="flex flex-col box-border"></main>',
      ),
    ).toBeInTheDocument();
    expect(source).toHaveValue(editedSource);
    expect(screen.getByRole('status')).toHaveTextContent('Migration complete. 1 directive converted.');
    expect(networkRequest).not.toHaveBeenCalled();
  });

  it('loads a curated preset and reset restores the initial state', () => {
    render(<Playground />);

    fireEvent.change(screen.getByLabelText('Template preset'), { target: { value: 'responsive-stack' } });
    expect(screen.getByRole('textbox', { name: 'Angular template' })).toHaveValue(
      '<section fxLayout="column" fxLayout.gt-sm="row" fxLayoutGap="24px"></section>',
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Native CSS' }));
    fireEvent.click(screen.getByRole('button', { name: 'Migrate template' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset playground' }));

    expect(screen.getByLabelText('Template preset')).toHaveValue('row-with-gap');
    expect(screen.getByRole('textbox', { name: 'Angular template' })).toHaveValue(defaultSource);
    expect(screen.getByRole('radio', { name: 'Tailwind CSS' })).toBeChecked();
    expect(screen.getByText('Run a migration to inspect the proposed output.')).toBeInTheDocument();
  });

  it('switches targets and exposes real HTML and generated CSS in keyboard-operable tabs', () => {
    render(<Playground />);

    expect(screen.getByRole('group', { name: 'Migration target' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Tailwind CSS' })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: 'Native CSS' }));
    fireEvent.click(screen.getByRole('button', { name: 'Migrate template' }));

    const htmlTab = screen.getByRole('tab', { name: 'HTML' });
    const cssTab = screen.getByRole('tab', { name: 'CSS' });
    expect(htmlTab).toHaveAttribute('aria-selected', 'true');
    expect(within(screen.getByRole('tabpanel', { name: 'HTML' })).getByText(/class="flm-/u)).toBeInTheDocument();

    fireEvent.click(cssTab);

    expect(cssTab).toHaveAttribute('aria-selected', 'true');
    expect(htmlTab).toHaveAttribute('aria-selected', 'false');
    expect(
      within(screen.getByRole('tabpanel', { name: 'CSS' })).getByText(/flex-layout-codemod:start/u),
    ).toBeInTheDocument();
  });

  it('uses roving focus and conventional arrow, Home, and End keys for output tabs', () => {
    render(<Playground />);
    fireEvent.click(screen.getByRole('radio', { name: 'Native CSS' }));
    fireEvent.click(screen.getByRole('button', { name: 'Migrate template' }));

    const htmlTab = screen.getByRole('tab', { name: 'HTML' });
    const cssTab = screen.getByRole('tab', { name: 'CSS' });
    expect(htmlTab).toHaveAttribute('tabindex', '0');
    expect(cssTab).toHaveAttribute('tabindex', '-1');

    htmlTab.focus();
    fireEvent.keyDown(htmlTab, { key: 'ArrowRight' });
    expect(cssTab).toHaveFocus();
    expect(cssTab).toHaveAttribute('aria-selected', 'true');
    expect(cssTab).toHaveAttribute('tabindex', '0');
    expect(htmlTab).toHaveAttribute('tabindex', '-1');

    fireEvent.keyDown(cssTab, { key: 'Home' });
    expect(htmlTab).toHaveFocus();
    expect(htmlTab).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(htmlTab, { key: 'End' });
    expect(cssTab).toHaveFocus();
    fireEvent.keyDown(cssTab, { key: 'ArrowLeft' });
    expect(htmlTab).toHaveFocus();
  });

  it('shows structured diagnostics while preserving dynamic and invalid source', () => {
    render(<Playground />);
    const dynamicSource = '<div [fxFlex]="basis"></div>';
    const source = screen.getByRole('textbox', { name: 'Angular template' });

    fireEvent.change(source, { target: { value: dynamicSource } });
    fireEvent.click(screen.getByRole('button', { name: 'Migrate template' }));

    expect(source).toHaveValue(dynamicSource);
    expect(screen.getByRole('heading', { name: 'Diagnostics' })).toBeInTheDocument();
    expect(screen.getByText('dynamic-binding')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Migration needs review. 1 diagnostic reported.');

    fireEvent.click(screen.getByRole('button', { name: 'Reset playground' }));
    const invalidSource = '<div><span></div>';
    const invalidInput = screen.getByRole('textbox', { name: 'Angular template' });
    fireEvent.change(invalidInput, { target: { value: invalidSource } });
    fireEvent.click(screen.getByRole('button', { name: 'Migrate template' }));

    expect(invalidInput).toHaveValue(invalidSource);
    expect(within(screen.getByRole('tabpanel', { name: 'HTML' })).getByText(invalidSource)).toBeInTheDocument();
    expect(screen.getByText('template-parse-error')).toBeInTheDocument();
  });

  it('reports clipboard success after copying the proposed HTML', async () => {
    let copied = '';
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: (value: string) => Promise.resolve((copied = value)) },
    });
    render(<Playground />);
    fireEvent.click(screen.getByRole('button', { name: 'Migrate template' }));

    fireEvent.click(screen.getByRole('button', { name: 'Copy HTML' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('HTML copied to clipboard.'));
    expect(copied).toBe(defaultTailwind);
  });

  it('gives a manual fallback when clipboard access fails', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error('Clipboard denied')) },
    });
    render(<Playground />);
    fireEvent.click(screen.getByRole('button', { name: 'Migrate template' }));

    fireEvent.click(screen.getByRole('button', { name: 'Copy HTML' }));

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Could not copy HTML. Select and copy it manually.'),
    );
  });
});
