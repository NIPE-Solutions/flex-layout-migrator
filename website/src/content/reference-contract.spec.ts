import { FLEX_LAYOUT_DIRECTIVES } from '@core/analyzer/flex-layout.catalog';
import type { DiagnosticCode } from '@core/analyzer/conversion-result';
import { previewTemplate } from '@core/browser/template-preview';

import { cliReference } from './cli-reference';
import { compatibilityReference } from './compatibility-reference';
import { diagnosticReference } from './diagnostic-reference';
import { verifiedExamples } from './example-reference';
import { reportReference } from './report-reference';

const expectedDiagnosticCodes = [
  'bound-class',
  'class-conflict',
  'breakpoint-unverified',
  'custom-breakpoint',
  'dynamic-binding',
  'display-restoration-unverified',
  'invalid-value',
  'context-unverified',
  'responsive-precedence-unverified',
  'semantic-unsupported',
  'style-value-unverified',
  'tailwind-candidate-unverified',
  'target-unsupported',
] as const satisfies readonly DiagnosticCode[];

describe('public documentation registries', () => {
  test('covers every public CLI option exactly once with current option metadata', () => {
    expect(cliReference.map(option => option.longFlag).sort()).toEqual([
      '--allow-unresolved',
      '--debug',
      '--orientation-breakpoints',
      '--output',
      '--print-with-breakpoints',
      '--report',
      '--responsive-images',
      '--stylesheet',
      '--target',
      '--version',
      '--write',
    ]);
    expect(new Set(cliReference.map(option => option.longFlag))).toHaveLength(cliReference.length);
    expect(cliReference.find(option => option.longFlag === '--target')).toMatchObject({
      shortFlag: '-t',
      valueName: 'target',
      choices: ['tailwind', 'css'],
      defaultValue: 'tailwind',
    });
    expect(cliReference.find(option => option.longFlag === '--write')).toMatchObject({ defaultValue: false });
  });

  test('covers all conversion and parse diagnostic codes with actionable guidance', () => {
    expect(new Set(diagnosticReference.map(item => item.code))).toEqual(
      new Set<DiagnosticCode | 'template-parse-error' | 'generated-template-parse-error'>([
        ...expectedDiagnosticCodes,
        'template-parse-error',
        'generated-template-parse-error',
      ]),
    );
    expect(new Set(diagnosticReference.map(item => item.code))).toHaveLength(diagnosticReference.length);
    for (const diagnostic of diagnosticReference) {
      expect(diagnostic.family).not.toBe('');
      expect(diagnostic.meaning).not.toBe('');
      expect(diagnostic.unsafeToGuess).not.toBe('');
      expect(diagnostic.resolution.length).toBeGreaterThan(0);
      expect(typeof diagnostic.rerunEligible).toBe('boolean');
    }
  });

  test('classifies every recognized compatibility directive once and records evidence', () => {
    expect(compatibilityReference.map(entry => entry.id).sort()).toEqual([...FLEX_LAYOUT_DIRECTIVES].sort());
    expect(new Set(compatibilityReference.map(entry => entry.id))).toHaveLength(compatibilityReference.length);
    expect(compatibilityReference.find(entry => entry.id === 'fxLayout')).toMatchObject({
      category: 'flex',
      tailwind: 'limited',
      css: 'limited',
    });
    expect(compatibilityReference.find(entry => entry.id === 'gdColumns')).toMatchObject({
      category: 'grid',
      tailwind: 'limited',
      css: 'preserved',
    });
    expect(compatibilityReference.find(entry => entry.id === 'imgSrc')).toMatchObject({
      category: 'images',
      tailwind: 'not-applicable',
      css: 'not-applicable',
    });
    for (const entry of compatibilityReference) expect(entry.evidence.length).toBeGreaterThan(0);
  });

  test('publishes the complete schema-2 report field contract and valid examples', () => {
    expect(reportReference.schemaVersion).toBe(2);
    expect(reportReference.fields.map(field => field.path)).toEqual([
      'schemaVersion',
      'mode',
      'target',
      'application',
      'application.status',
      'application.reason',
      'input',
      'output',
      'durationMs',
      'summary',
      'summary.filesScanned',
      'summary.filesChanged',
      'summary.converted',
      'summary.review',
      'summary.unsupported',
      'summary.invalid',
      'summary.parseErrors',
      'files',
      'files[].path',
      'files[].changed',
      'files[].results',
      'files[].results[].status',
      'files[].results[].directive',
      'files[].results[].sourceName',
      'files[].results[].offset',
      'files[].results[].code',
      'files[].results[].reason',
      'files[].results[].suggestion',
      'stylesheet',
      'stylesheet.path',
      'stylesheet.change',
    ]);
    expect(reportReference.examples.map(example => example.id)).toEqual(['plan', 'write', 'parse-error']);
  });

  test('keeps every verified transformation synchronized with the production browser preview', () => {
    for (const example of verifiedExamples) {
      const result = previewTemplate(example.input);
      const publicResults = result.results.map(item =>
        item.status === 'converted' ? { status: item.status } : { status: item.status, code: item.code },
      );

      expect(result.html, example.id).toBe(example.expectedOutput);
      expect(result.css, example.id).toBe(example.expectedCss);
      expect(publicResults, example.id).toEqual(example.expectedResults);
      for (const expected of example.expectedResults) {
        if (expected.status === 'converted') {
          expect(expected).not.toHaveProperty('code');
        } else {
          expect(new Set(diagnosticReference.map(item => item.code))).toContain(expected.code);
        }
      }
      expect(example.evidence.length).toBeGreaterThanOrEqual(3);
    }
  });

  test('deeply freezes every exported registry', () => {
    for (const registry of [
      cliReference,
      diagnosticReference,
      compatibilityReference,
      reportReference,
      verifiedExamples,
    ]) {
      expectDeepFrozen(registry);
    }
  });
});

function expectDeepFrozen(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const item of Object.values(value)) expectDeepFrozen(item);
}
