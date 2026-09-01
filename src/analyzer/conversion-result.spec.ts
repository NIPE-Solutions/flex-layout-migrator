import type { ConversionResult } from './conversion-result';

const input = {
  sourceName: 'fxLayout',
  directive: 'fxLayout',
  value: 'row',
  binding: 'literal',
  breakpoint: undefined,
} as const;

const results = [
  { status: 'converted', input },
  {
    status: 'review',
    input,
    code: 'dynamic-binding',
    reason: 'Runtime expression.',
    suggestion: 'Migrate manually.',
  },
  {
    status: 'review',
    input,
    code: 'tailwind-candidate-unverified',
    reason: 'The token may be an application or plugin class.',
    suggestion: 'Keep the responsive class family or migrate it manually.',
  },
  {
    status: 'parse-error',
    fileName: 'broken.html',
    code: 'template-parse-error',
    reason: 'Unexpected closing tag.',
    source: { start: 10, end: 16 },
  },
] satisfies readonly ConversionResult[];

test('models successful, unresolved, and parse-error results exhaustively', () => {
  expect(results.map(result => result.status)).toEqual(['converted', 'review', 'review', 'parse-error']);
});
