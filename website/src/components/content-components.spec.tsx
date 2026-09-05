// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveExitCode } from '../../../src/cli/exit-policy';
import { cliReference } from '../content/cli-reference';
import { documentationPages, loadDocumentationPage } from '../content/docs-loader';
import { diagnosticReference } from '../content/diagnostic-reference';
import { reportReference } from '../content/report-reference';
import { DiagnosticCallout } from './diagnostic-callout';
import { DocsLayout } from './docs-layout';
import { MigrationChecklist } from './migration-checklist';
import { ReportExample, validatedReportExample } from './report-example';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'clipboard');
});

describe('documentation content components', () => {
  it('separates required tool behavior from recommended migration practice', () => {
    render(
      <MigrationChecklist
        requirements={['Use an explicit write flag before applying project changes.']}
        recommendations={['Begin from a clean worktree.']}
      />,
    );

    const checklist = screen.getByRole('region', { name: 'Migration checklist' });
    expect(within(checklist).getByText('Tool behavior')).toBeVisible();
    expect(within(checklist).getByText('Recommended practice')).toBeVisible();
    expect(within(checklist).getByText('Use an explicit write flag before applying project changes.')).toBeVisible();
    expect(within(checklist).getByText('Begin from a clean worktree.')).toBeVisible();
  });

  it.each(['dynamic-binding', 'target-unsupported', 'semantic-unsupported'] as const)(
    'renders registry-backed diagnostic %s without a generic status or resolution',
    code => {
      const reference = diagnosticReference.find(entry => entry.code === code);
      expect(reference).toBeDefined();

      render(<DiagnosticCallout code={code} />);

      const callout = screen.getByRole('note', { name: code });
      expect(within(callout).getByRole('link', { name: code })).toHaveAttribute('href', `/docs/diagnostics#${code}`);
      expect(within(callout).getByText(reference!.meaning)).toBeVisible();
      expect(within(callout).getByText(reference!.unsafeToGuess)).toBeVisible();
      for (const resolution of reference!.resolution) expect(within(callout).getByText(resolution)).toBeVisible();
      expect(within(callout).queryByText('Preserved for review')).not.toBeInTheDocument();
      expect(within(callout).queryByText('Complete this case manually.')).not.toBeInTheDocument();
    },
  );

  it('renders and copies the schema-2 report example with polite feedback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

    render(<ReportExample report={validatedReportExample} label="Example report" />);

    expect(validatedReportExample).toBe(reportReference.examples.find(example => example.id === 'plan')!.value);
    expect(validatedReportExample.schemaVersion).toBe(2);
    expect(screen.getByText('Schema version')).toBeVisible();
    expect(screen.getByText('2')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Copy Example report' }));

    expect(writeText).toHaveBeenCalledWith(`${JSON.stringify(validatedReportExample, null, 2)}\n`);
    const announcement = await screen.findByText('Example report copied to clipboard.', { selector: 'span' });
    expect(announcement).toHaveAttribute('aria-live', 'polite');
  });
});

describe('workflow and safety claims', () => {
  it('presents the migration workflow and labels practice separately from tool behavior', () => {
    render(<DocsLayout page={loadDocumentationPage('/docs/workflow')} />);

    expect(screen.getByRole('heading', { name: 'Migration Workflow' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Recommended practice' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Tool behavior' })).toBeVisible();
  });

  it('does not claim that plan mode has zero filesystem effects when a report is requested', () => {
    render(<DocsLayout page={loadDocumentationPage('/docs/safety')} />);

    expect(screen.getByText(/plan mode can create the requested report and its parent directory/iu)).toBeVisible();
    expect(screen.getByText(/does not write project templates or the companion stylesheet/iu)).toBeVisible();
  });

  it('states rollback limits for storage failure and forced termination', () => {
    render(<DocsLayout page={loadDocumentationPage('/docs/transactions')} />);

    expect(screen.getByText(/storage failure/iu)).toBeVisible();
    expect(screen.getByText(/forced termination/iu)).toBeVisible();
    expect(screen.getByText(/CLI boundary, normal mode prints one concise error message/iu)).toBeVisible();
    expect(screen.getByText(/debug mode can additionally print the error stack/iu)).toBeVisible();
    expect(screen.queryByText(/transaction errors identify paths whose recovery/iu)).not.toBeInTheDocument();
  });

  it('documents the exact selected-root gitignore boundary', () => {
    render(<DocsLayout page={loadDocumentationPage('/docs/installation')} />);

    const boundary = screen.getByText((_, element) =>
      Boolean(
        element?.tagName === 'P' &&
        /loads only the \.gitignore directly inside the selected input root/iu.test(element.textContent ?? ''),
      ),
    );
    expect(boundary).toBeVisible();
    expect(boundary).toHaveTextContent(/does not load parent or nested \.gitignore files/iu);
  });

  it('documents strict exit code 2 with the same unresolved categories as resolveExitCode', () => {
    const base = validatedReportExample;
    for (const field of ['review', 'unsupported', 'invalid'] as const) {
      const report = {
        ...base,
        summary: { ...base.summary, review: 0, unsupported: 0, invalid: 0, [field]: 1 },
      };
      expect(resolveExitCode(report, false)).toBe(2);
      expect(resolveExitCode(report, true)).toBe(0);
    }

    render(<DocsLayout page={loadDocumentationPage('/docs/ci')} />);
    expect(screen.getByText(/exit code 2 means.*review, unsupported, or invalid.*strict mode/iu)).toBeVisible();
  });

  it('uses only registered CLI flags in workflow and automation commands', () => {
    const documentedFlags = new Set<string>();
    for (const option of cliReference) {
      documentedFlags.add(option.longFlag);
      if ('shortFlag' in option) documentedFlags.add(option.shortFlag);
    }
    for (const page of documentationPages) {
      const commands = page.blocks
        .filter(block => block.kind === 'code')
        .flatMap(block => block.value.split('\n'))
        .filter(command => command.trimStart().startsWith('npx flex-layout-codemod'));
      for (const flag of commands.flatMap(
        command => command.match(/(?:^|\s)(--[a-z][a-z-]*|-[A-Za-z])(?=\s|$)/gu) ?? [],
      )) {
        expect(documentedFlags.has(flag.trim())).toBe(true);
      }
    }
  });
});
