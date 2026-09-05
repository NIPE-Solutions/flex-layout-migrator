import type { MigrationReport } from '../../../src/report/migration-report';

import { deepFreeze } from './public-contract';

export interface ReportFieldReference {
  readonly path: string;
  readonly type: string;
  readonly required: boolean;
  readonly description: string;
}

export interface ReportExample {
  readonly id: string;
  readonly description: string;
  readonly value: MigrationReport;
}

export interface ReportReference {
  readonly schemaVersion: MigrationReport['schemaVersion'];
  readonly fields: readonly ReportFieldReference[];
  readonly examples: readonly ReportExample[];
}

export const reportReference = deepFreeze({
  schemaVersion: 2,
  fields: [
    { path: 'schemaVersion', type: '2', required: true, description: 'Public report schema version.' },
    { path: 'mode', type: 'plan | write', required: true, description: 'Requested migration mode.' },
    { path: 'target', type: 'css | tailwind', required: true, description: 'Selected rendering target.' },
    {
      path: 'application',
      type: 'MigrationApplication',
      required: true,
      description: 'Whether the validated proposal was applied or skipped.',
    },
    {
      path: 'application.status',
      type: 'applied | skipped',
      required: true,
      description: 'Application outcome.',
    },
    {
      path: 'application.reason',
      type: 'plan-only | parse-errors',
      required: false,
      description: 'Reason a proposal was not applied.',
    },
    { path: 'input', type: 'string', required: true, description: 'Portable input path.' },
    { path: 'output', type: 'string', required: true, description: 'Portable proposed output path.' },
    { path: 'durationMs', type: 'number', required: true, description: 'Elapsed migration duration in milliseconds.' },
    { path: 'summary', type: 'MigrationSummary', required: true, description: 'Derived aggregate counts.' },
    { path: 'summary.filesScanned', type: 'number', required: true, description: 'Templates scanned.' },
    { path: 'summary.filesChanged', type: 'number', required: true, description: 'Templates with proposed changes.' },
    { path: 'summary.converted', type: 'number', required: true, description: 'Converted directive occurrences.' },
    { path: 'summary.review', type: 'number', required: true, description: 'Occurrences requiring review.' },
    { path: 'summary.unsupported', type: 'number', required: true, description: 'Unsupported occurrences.' },
    { path: 'summary.invalid', type: 'number', required: true, description: 'Invalid directive occurrences.' },
    { path: 'summary.parseErrors', type: 'number', required: true, description: 'Template parse failures.' },
    { path: 'files', type: 'FileReport[]', required: true, description: 'Path-sorted template results.' },
    { path: 'files[].path', type: 'string', required: true, description: 'Input-relative POSIX file path.' },
    {
      path: 'files[].changed',
      type: 'boolean',
      required: true,
      description: 'Whether the validated proposal changes the template.',
    },
    {
      path: 'files[].results',
      type: 'ReportResult[]',
      required: true,
      description: 'Directive and parse results for the template.',
    },
    {
      path: 'files[].results[].status',
      type: 'converted | review | unsupported | invalid | parse-error',
      required: true,
      description: 'Result classification.',
    },
    {
      path: 'files[].results[].directive',
      type: 'string',
      required: false,
      description: 'Canonical directive family for a non-parse result.',
    },
    {
      path: 'files[].results[].sourceName',
      type: 'string',
      required: false,
      description: 'Exact source attribute name for a non-parse result.',
    },
    {
      path: 'files[].results[].offset',
      type: 'number',
      required: true,
      description: 'Zero-based source offset.',
    },
    {
      path: 'files[].results[].code',
      type: 'string',
      required: false,
      description: 'Diagnostic code for unresolved or parse results.',
    },
    {
      path: 'files[].results[].reason',
      type: 'string',
      required: false,
      description: 'Diagnostic explanation for unresolved or parse results.',
    },
    {
      path: 'files[].results[].suggestion',
      type: 'string',
      required: false,
      description: 'Actionable next step for unresolved results.',
    },
    {
      path: 'stylesheet',
      type: 'StylesheetReport',
      required: false,
      description: 'Proposed companion stylesheet result for the CSS target.',
    },
    { path: 'stylesheet.path', type: 'string', required: true, description: 'Portable stylesheet path.' },
    {
      path: 'stylesheet.change',
      type: 'created | updated | removed | unchanged',
      required: true,
      description: 'Proposed stylesheet action.',
    },
  ],
  examples: [
    {
      id: 'plan',
      description: 'A plan with one converted occurrence and one item requiring review.',
      value: {
        schemaVersion: 2,
        mode: 'plan',
        target: 'tailwind',
        application: { status: 'skipped', reason: 'plan-only' },
        input: 'card.component.html',
        output: 'card.component.html',
        durationMs: 12,
        summary: {
          filesScanned: 1,
          filesChanged: 1,
          converted: 1,
          review: 1,
          unsupported: 0,
          invalid: 0,
          parseErrors: 0,
        },
        files: [
          {
            path: 'card.component.html',
            changed: true,
            results: [
              { status: 'converted', directive: 'fxLayout', sourceName: 'fxLayout', offset: 5 },
              {
                status: 'review',
                directive: 'fxFlex',
                sourceName: '[fxFlex]',
                offset: 20,
                code: 'dynamic-binding',
                reason: 'Angular property bindings may depend on runtime state.',
                suggestion: 'Replace the binding manually or make it a literal before migration.',
              },
            ],
          },
        ],
      },
    },
    {
      id: 'write',
      description: 'A CSS write with an applied template and created companion stylesheet.',
      value: {
        schemaVersion: 2,
        mode: 'write',
        target: 'css',
        application: { status: 'applied' },
        input: 'card.component.html',
        output: 'card.component.html',
        durationMs: 8,
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
            path: 'card.component.html',
            changed: true,
            results: [{ status: 'converted', directive: 'fxLayout', sourceName: 'fxLayout', offset: 5 }],
          },
        ],
        stylesheet: { path: 'flex-layout-migration.css', change: 'created' },
      },
    },
    {
      id: 'parse-error',
      description: 'A write request skipped because its source template is invalid.',
      value: {
        schemaVersion: 2,
        mode: 'write',
        target: 'tailwind',
        application: { status: 'skipped', reason: 'parse-errors' },
        input: 'broken.component.html',
        output: 'broken.component.html',
        durationMs: 4,
        summary: {
          filesScanned: 1,
          filesChanged: 0,
          converted: 0,
          review: 0,
          unsupported: 0,
          invalid: 0,
          parseErrors: 1,
        },
        files: [
          {
            path: 'broken.component.html',
            changed: false,
            results: [
              {
                status: 'parse-error',
                offset: 11,
                code: 'template-parse-error',
                reason: 'Unexpected closing tag.',
              },
            ],
          },
        ],
      },
    },
  ],
} as const satisfies ReportReference);
