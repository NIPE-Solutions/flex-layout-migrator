import type { MigrationReport } from './migration-report';
import { TerminalPresenter, type TextOutput } from './terminal.presenter';

class MemoryOutput implements TextOutput {
  public text = '';

  public constructor(public readonly isTTY?: boolean) {}

  public write(text: string): void {
    this.text += text;
  }
}

function report(overrides: Partial<MigrationReport> = {}): MigrationReport {
  return {
    schemaVersion: 1,
    target: 'tailwind',
    dryRun: false,
    input: 'templates',
    output: 'generated',
    durationMs: 17,
    summary: {
      filesScanned: 2,
      filesChanged: 1,
      converted: 1,
      review: 0,
      unsupported: 0,
      invalid: 0,
      parseErrors: 0,
    },
    files: [
      {
        path: 'card.html',
        changed: true,
        results: [{ status: 'converted', directive: 'fxLayout', sourceName: 'fxLayout', offset: 2 }],
      },
      { path: 'nested/card.html', changed: false, results: [] },
    ],
    ...overrides,
  };
}

describe('TerminalPresenter', () => {
  test('presents a clean completed migration as deterministic plain text', () => {
    const output = new MemoryOutput(false);

    new TerminalPresenter().present(report(), output);

    expect(output.text).toBe(
      '2 files scanned, 1 changed\nConverted 1 | Review 0 | Unsupported 0 | Invalid 0 | Parse errors 0\n',
    );
  });

  test('labels dry-run changed templates as would change', () => {
    const output = new MemoryOutput(false);

    new TerminalPresenter().present(report({ dryRun: true }), output);

    expect(output.text).toBe(
      'Dry run: 2 files scanned, 1 would change\nConverted 1 | Review 0 | Unsupported 0 | Invalid 0 | Parse errors 0\n',
    );
  });

  test('emits unresolved diagnostics in file and result order without interactive copy', () => {
    const output = new MemoryOutput(false);
    const unresolved = report({
      summary: {
        filesScanned: 2,
        filesChanged: 1,
        converted: 1,
        review: 1,
        unsupported: 1,
        invalid: 1,
        parseErrors: 1,
      },
      files: [
        {
          path: 'nested/card.html',
          changed: false,
          results: [
            {
              status: 'review',
              directive: 'fxFlex',
              sourceName: 'fxFlex',
              offset: 14,
              code: 'dynamic-binding',
              reason: 'Angular property bindings may depend on runtime state.',
              suggestion: 'Review manually.',
            },
            {
              status: 'unsupported',
              directive: 'fxHide',
              sourceName: 'fxHide',
              offset: 2,
              code: 'target-unsupported',
              reason: 'No Tailwind equivalent is available.',
              suggestion: 'Use CSS.',
            },
          ],
        },
        {
          path: 'card.html',
          changed: true,
          results: [
            {
              status: 'invalid',
              directive: 'fxLayout',
              sourceName: 'fxLayout',
              offset: 8,
              code: 'invalid-edit',
              reason: 'Overlapping edits cannot be applied.',
              suggestion: 'Remove the overlap.',
            },
            {
              status: 'parse-error',
              offset: 1,
              code: 'template-parse-error',
              reason: 'Unexpected closing tag.',
            },
          ],
        },
      ],
    });

    new TerminalPresenter().present(unresolved, output);

    expect(output.text).toBe(
      [
        '2 files scanned, 1 changed',
        'Converted 1 | Review 1 | Unsupported 1 | Invalid 1 | Parse errors 1',
        'nested/card.html:14 [dynamic-binding] Angular property bindings may depend on runtime state.',
        'nested/card.html:2 [target-unsupported] No Tailwind equivalent is available.',
        'card.html:8 [invalid-edit] Overlapping edits cannot be applied.',
        'card.html:1 [template-parse-error] Unexpected closing tag.',
        '',
      ].join('\n'),
    );
    expect(output.text).not.toContain('\u001b[');
    expect(output.text).not.toMatch(/Thank you|Phase 1|Phase 2|[\u{1F300}-\u{1FAFF}]/u);
  });

  test.each([
    ['created', false, 'created'],
    ['created', true, 'would create'],
    ['updated', false, 'updated'],
    ['updated', true, 'would update'],
    ['removed', false, 'removed'],
    ['removed', true, 'would remove'],
    ['unchanged', false, 'unchanged'],
    ['unchanged', true, 'unchanged'],
  ] as const)('presents a %s stylesheet in dry-run=%s as %s', (change, dryRun, wording) => {
    const output = new MemoryOutput(false);

    new TerminalPresenter().present(
      report({
        target: 'css',
        dryRun,
        stylesheet: { path: 'flex-layout-migration.css', change },
      }),
      output,
    );

    const lines = output.text.split('\n');
    expect(lines[2]).toBe(`Stylesheet: ${wording} flex-layout-migration.css`);
  });

  test('does not add a stylesheet line to Tailwind output', () => {
    const output = new MemoryOutput(false);

    new TerminalPresenter().present(report(), output);

    expect(output.text).not.toContain('Stylesheet:');
  });
});
