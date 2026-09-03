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
    schemaVersion: 2,
    mode: 'write',
    target: 'tailwind',
    application: { status: 'applied' },
    input: 'templates',
    output: 'generated',
    durationMs: 17,
    summary: {
      filesScanned: 1,
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
    ],
    ...overrides,
  };
}

describe('TerminalPresenter', () => {
  test('presents a clean plan as deterministic plain text', () => {
    const output = new MemoryOutput(false);

    new TerminalPresenter().present(
      report({ mode: 'plan', application: { status: 'skipped', reason: 'plan-only' } }),
      output,
    );

    expect(output.text).toBe(
      [
        'Plan: 1 files scanned, 1 would change',
        'Converted 1 | Review 0 | Unsupported 0 | Invalid 0 | Parse errors 0',
        'No project files were written. Run again with --write to apply this plan.',
        '',
      ].join('\n'),
    );
  });

  test('presents a clean applied migration as deterministic plain text', () => {
    const output = new MemoryOutput(false);

    new TerminalPresenter().present(report(), output);

    expect(output.text).toBe(
      [
        'Applied: 1 files scanned, 1 changed',
        'Converted 1 | Review 0 | Unsupported 0 | Invalid 0 | Parse errors 0',
        '',
      ].join('\n'),
    );
  });

  test('presents write mode with parse errors as an unapplied plan', () => {
    const output = new MemoryOutput(false);
    const unresolved = report({
      mode: 'write',
      application: { status: 'skipped', reason: 'parse-errors' },
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
        'Write: 2 files scanned, 1 would change',
        'Converted 1 | Review 1 | Unsupported 1 | Invalid 1 | Parse errors 1',
        'nested/card.html:14 [dynamic-binding] Angular property bindings may depend on runtime state.',
        'nested/card.html:2 [target-unsupported] No Tailwind equivalent is available.',
        'card.html:8 [invalid-edit] Overlapping edits cannot be applied.',
        'card.html:1 [template-parse-error] Unexpected closing tag.',
        'No project files were written because parsing failed.',
        '',
      ].join('\n'),
    );
    expect(output.text).not.toContain('\u001b[');
  });

  test.each([
    ['created', 'would create'],
    ['updated', 'would update'],
    ['removed', 'would remove'],
    ['unchanged', 'would remain unchanged'],
  ] as const)('presents a %s stylesheet prospectively in plan mode', (change, wording) => {
    const output = new MemoryOutput(false);

    new TerminalPresenter().present(
      report({
        mode: 'plan',
        application: { status: 'skipped', reason: 'plan-only' },
        target: 'css',
        stylesheet: { path: 'flex-layout-migration.css', change },
      }),
      output,
    );

    expect(output.text).toContain(`Stylesheet: ${wording} flex-layout-migration.css`);
  });

  test.each([
    ['created', 'created'],
    ['updated', 'updated'],
    ['removed', 'removed'],
    ['unchanged', 'unchanged'],
  ] as const)('presents an applied %s stylesheet with completed wording', (change, wording) => {
    const output = new MemoryOutput(false);

    new TerminalPresenter().present(
      report({ target: 'css', stylesheet: { path: 'flex-layout-migration.css', change } }),
      output,
    );

    expect(output.text).toContain(`Stylesheet: ${wording} flex-layout-migration.css`);
  });

  test('keeps stylesheet prospective in every skipped application state', () => {
    const output = new MemoryOutput(false);

    new TerminalPresenter().present(
      report({
        target: 'css',
        mode: 'write',
        application: { status: 'skipped', reason: 'parse-errors' },
        stylesheet: { path: 'flex-layout-migration.css', change: 'created' },
      }),
      output,
    );

    expect(output.text).toContain('Stylesheet: would create flex-layout-migration.css');
    expect(output.text).not.toContain('Stylesheet: created');
  });

  test('keeps an unchanged stylesheet prospective when parsing skips a write', () => {
    const output = new MemoryOutput(false);

    new TerminalPresenter().present(
      report({
        target: 'css',
        mode: 'write',
        application: { status: 'skipped', reason: 'parse-errors' },
        stylesheet: { path: 'flex-layout-migration.css', change: 'unchanged' },
      }),
      output,
    );

    expect(output.text).toContain('Stylesheet: would remain unchanged flex-layout-migration.css');
  });

  test('rejects an applied report requested in plan mode', () => {
    const output = new MemoryOutput(false);

    expect(() =>
      new TerminalPresenter().present(report({ mode: 'plan', application: { status: 'applied' } }), output),
    ).toThrow('Applied application requires write mode.');
  });

  test('rejects a plan-only report requested in write mode', () => {
    const output = new MemoryOutput(false);

    expect(() =>
      new TerminalPresenter().present(
        report({ mode: 'write', application: { status: 'skipped', reason: 'plan-only' } }),
        output,
      ),
    ).toThrow('Plan-only application requires plan mode.');
  });

  test('does not add a stylesheet line to Tailwind output', () => {
    const output = new MemoryOutput(false);

    new TerminalPresenter().present(report(), output);

    expect(output.text).not.toContain('Stylesheet:');
  });
});
