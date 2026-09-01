import type { LocatedFlexLayoutInput } from '../../../analyzer/flex-layout-attribute.analyzer';
import { TailwindCandidateClassifier } from './tailwind-candidate-classifier';
import { parseResponsiveClassValue } from './responsive-class-value.parser';

function input(overrides: Partial<LocatedFlexLayoutInput> = {}): LocatedFlexLayoutInput {
  return {
    id: 'fixture:ngClass.sm',
    fileName: 'fixture.html',
    elementId: '0',
    sourceName: 'ngClass.sm',
    directive: 'ngClass',
    value: 'flex',
    binding: 'literal',
    breakpoint: 'sm',
    source: { start: 0, end: 22 },
    nameSource: { start: 0, end: 10 },
    valueSource: { start: 12, end: 16 },
    ...overrides,
  };
}

const classifier = new TailwindCandidateClassifier();

describe('parseResponsiveClassValue', () => {
  test('splits decoded values on HTML whitespace and removes duplicate tokens in first-seen order', () => {
    expect(
      parseResponsiveClassValue(input({ value: ' flex\titems-center\nflex\fgrid\ritems-center ' }), classifier),
    ).toEqual({
      status: 'parsed',
      value: { tokens: ['flex', 'items-center', 'grid'] },
    });
  });

  test('classifies decoded entity characters instead of source entity spellings', () => {
    expect(parseResponsiveClassValue(input({ value: '[&>*]:block' }), classifier)).toEqual({
      status: 'parsed',
      value: { tokens: ['[&>*]:block'] },
    });
  });

  test('accepts proven variant-bearing utilities and arbitrary properties', () => {
    expect(
      parseResponsiveClassValue(
        input({ value: 'dark:hover:text-white [color:#334155] [--card-gap:1rem]' }),
        classifier,
      ),
    ).toEqual({
      status: 'parsed',
      value: { tokens: ['dark:hover:text-white', '[color:#334155]', '[--card-gap:1rem]'] },
    });
  });

  test('parses an empty literal value as an empty token list', () => {
    expect(parseResponsiveClassValue(input({ value: ' \t\n\f\r' }), classifier)).toEqual({
      status: 'parsed',
      value: { tokens: [] },
    });
  });

  test('rejects the complete value at the first unverified application token', () => {
    const result = parseResponsiveClassValue(
      input({ value: 'flex dashboard-panel items-center plugin-widget' }),
      classifier,
    );

    expect(result).toMatchObject({ status: 'unverified', token: 'dashboard-panel' });
    if (result.status !== 'unverified') throw new Error('Expected the class value to be unverified.');
    expect(result.reason).toContain('dashboard-panel');
    expect(result.reason).toMatch(/application or plugin class/u);
  });

  test.each([
    ['deprecated class alias', { sourceName: 'class.sm', directive: 'class' }],
    ['property-bound ngClass alias', { sourceName: '[ngClass.sm]', binding: 'property' }],
    ['interpolated ngClass value', { value: '{{ responsiveClasses }}' }],
    ['empty breakpoint suffix', { sourceName: 'ngClass.', breakpoint: '' }],
  ] as const)('leaves %s unverified', (_name, overrides) => {
    expect(parseResponsiveClassValue(input(overrides), classifier).status).toBe('unverified');
  });
});
