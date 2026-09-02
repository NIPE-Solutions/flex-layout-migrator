import type { OwnedCssRule } from '../css-artifact.model';
import { validateOwnedCssRule } from './css-artifact.validator';

const ID = 'a'.repeat(64);

const validRule: OwnedCssRule = Object.freeze({
  owner: 'flex-layout-codemod',
  id: ID,
  className: `flm-${ID}`,
  family: 'layout',
  declarations: Object.freeze([Object.freeze({ property: 'display', value: 'flex' })]),
  context: Object.freeze({ priority: 0 }),
});

function invalidArtifact(rule: OwnedCssRule): void {
  expect(() => validateOwnedCssRule(rule)).toThrow(expect.objectContaining({ code: 'invalid-artifact' }));
}

function invalidLexeme(rule: OwnedCssRule): void {
  expect(() => validateOwnedCssRule(rule)).toThrow(expect.objectContaining({ code: 'invalid-css-lexeme' }));
}

function ruleWithValue(value: string): OwnedCssRule {
  return { ...validRule, declarations: [{ property: 'color', value }] };
}

describe('validateOwnedCssRule', () => {
  test('accepts a valid frozen base rule', () => {
    expect(() => validateOwnedCssRule(validRule)).not.toThrow();
  });

  test.each([
    ['layout', [{ property: 'display', value: 'flex' }]],
    ['layout-align', [{ property: 'justify-content', value: 'space-between' }]],
    ['layout-gap', [{ property: 'gap', value: 'calc(50% - 1rem)' }]],
    ['flex-item', [{ property: 'box-sizing', value: 'border-box' }]],
    ['flex-align', [{ property: 'align-self', value: 'center' }]],
    ['flex-fill', [{ property: 'flex', value: '1 1 auto' }]],
    ['flex-offset', [{ property: 'margin-inline-start', value: '12.5px' }]],
    ['flex-order', [{ property: 'order', value: '-1' }]],
  ] as const)('accepts safe declarations for the %s family', (family, declarations) => {
    expect(() => validateOwnedCssRule({ ...validRule, family, declarations })).not.toThrow();
  });

  test.each([
    ['owner', { owner: 'other-codemod' }],
    ['short ID', { id: 'a'.repeat(63) }],
    ['uppercase ID', { id: `${'a'.repeat(63)}A` }],
    ['non-hexadecimal ID', { id: `${'a'.repeat(63)}g` }],
    ['class name', { className: 'flm-wrong' }],
    ['unknown family', { family: 'grid' }],
  ])('rejects an invalid %s identity field', (_label, mutation) => {
    invalidArtifact({ ...validRule, ...mutation } as OwnedCssRule);
  });

  test('rejects empty declarations', () => {
    invalidArtifact({ ...validRule, declarations: [] });
  });

  test('rejects duplicate declaration properties', () => {
    invalidArtifact({
      ...validRule,
      declarations: [
        { property: 'display', value: 'flex' },
        { property: 'display', value: 'inline-flex' },
      ],
    });
  });

  test.each(['display:', 'Display', '1display', '--custom'])('rejects malformed property %j', property => {
    invalidLexeme({ ...validRule, declarations: [{ property, value: 'flex' }] });
  });

  test.each([
    '',
    ' flex',
    'flex ',
    'red;display:none',
    'red{display:none}',
    'red/* comment */',
    'red\nblue',
    'red\rblue',
    'red\0blue',
  ])('rejects an unsafe declaration value %j', value => {
    invalidLexeme(ruleWithValue(value));
  });

  test.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects non-finite priority %s',
    priority => {
      invalidArtifact({ ...validRule, context: { priority } });
    },
  );

  test.each([-1, 1])('rejects nonzero base priority %s', priority => {
    invalidArtifact({ ...validRule, context: { priority } });
  });

  test('rejects media without clauses', () => {
    invalidArtifact({ ...validRule, context: { priority: 1, media: { type: 'screen', clauses: [] } } });
  });

  test.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects a non-finite media bound %s',
    bound => {
      invalidArtifact({
        ...validRule,
        context: { priority: 1, media: { type: 'screen', clauses: [{ min: bound }] } },
      });
    },
  );

  test('rejects reversed media bounds', () => {
    invalidArtifact({
      ...validRule,
      context: { priority: 1, media: { type: 'screen', clauses: [{ min: 960, max: 600 }] } },
    });
  });

  test('rejects a featureless screen clause', () => {
    invalidArtifact({ ...validRule, context: { priority: 1, media: { type: 'screen', clauses: [{}] } } });
  });

  test('accepts a featureless print clause', () => {
    expect(() =>
      validateOwnedCssRule({ ...validRule, context: { priority: -1000, media: { type: 'print', clauses: [{}] } } }),
    ).not.toThrow();
  });

  test('rejects malformed runtime structures despite their static cast', () => {
    invalidArtifact({
      ...validRule,
      declarations: [null],
      context: { priority: 1, media: { type: 'screen', clauses: [{ orientation: 'diagonal' }] } },
    } as unknown as OwnedCssRule);
  });
});
