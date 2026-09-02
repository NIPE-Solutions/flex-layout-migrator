import type { OwnedCssRule } from '../css-artifact.model';
import { serializeOwnedCssBlock } from './owned-css-block.serializer';

const ID = 'a'.repeat(64);

function rule(): OwnedCssRule {
  return {
    owner: 'flex-layout-codemod',
    id: ID,
    className: `flm-${ID}`,
    family: 'layout',
    declarations: [{ property: 'display', value: 'flex' }],
    context: { priority: 0 },
  };
}

describe('serializeOwnedCssBlock', () => {
  test.each(['\n', '\r\n'] as const)('wraps rules with markers using %j and no outer newline', newline => {
    expect(serializeOwnedCssBlock([rule()], newline)).toBe(
      `/* flex-layout-codemod:start schema=1 */${newline}/* flex-layout-codemod:rule id=${ID} */${newline}.flm-${ID} {${newline}  display: flex;${newline}}${newline}/* flex-layout-codemod:end */`,
    );
  });

  test('serializes no rules as an empty string', () => {
    expect(serializeOwnedCssBlock([], '\n')).toBe('');
  });

  test('validates every rule before producing a block', () => {
    const unsafe = { ...rule(), declarations: [{ property: 'display', value: 'flex; color: red' }] };

    expect(() => serializeOwnedCssBlock([rule(), unsafe], '\n')).toThrow(
      expect.objectContaining({ code: 'invalid-css-lexeme' }),
    );
  });
});
