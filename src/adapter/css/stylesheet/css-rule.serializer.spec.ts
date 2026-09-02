import type { OwnedCssRule } from '../css-artifact.model';
import { serializeCssRules } from './css-rule.serializer';

function rule(
  id: string,
  context: OwnedCssRule['context'] = { priority: 0 },
  declarations: OwnedCssRule['declarations'] = [{ property: 'display', value: 'flex' }],
): OwnedCssRule {
  return {
    owner: 'flex-layout-codemod',
    id,
    className: `flm-${id}`,
    family: 'layout',
    declarations,
    context,
  };
}

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);
const D = 'd'.repeat(64);
const MEDIA = { type: 'screen' as const, clauses: [{ min: 600, max: 959.98 }] };

describe('serializeCssRules', () => {
  test('serializes a base rule with declarations in artifact order using LF', () => {
    expect(
      serializeCssRules(
        [
          rule(A, { priority: 0 }, [
            { property: 'display', value: 'flex' },
            { property: 'flex-direction', value: 'row' },
          ]),
        ],
        '\n',
      ),
    ).toBe(`/* flex-layout-codemod:rule id=${A} */\n.flm-${A} {\n  display: flex;\n  flex-direction: row;\n}`);
  });

  test('uses the requested CRLF newline sequence', () => {
    expect(serializeCssRules([rule(A)], '\r\n')).toBe(
      `/* flex-layout-codemod:rule id=${A} */\r\n.flm-${A} {\r\n  display: flex;\r\n}`,
    );
  });

  test('separates adjacent base rules without reordering them', () => {
    expect(serializeCssRules([rule(A), rule(B)], '\n')).toBe(
      `/* flex-layout-codemod:rule id=${A} */\n.flm-${A} {\n  display: flex;\n}\n/* flex-layout-codemod:rule id=${B} */\n.flm-${B} {\n  display: flex;\n}`,
    );
  });

  test('indents responsive rules inside their media block', () => {
    expect(serializeCssRules([rule(A, { priority: 900, media: MEDIA })], '\n')).toBe(
      `@media screen and (min-width: 600px) and (max-width: 959.98px) {\n  /* flex-layout-codemod:rule id=${A} */\n  .flm-${A} {\n    display: flex;\n  }\n}`,
    );
  });

  test('groups only adjacent rules with structurally equal media and priority', () => {
    expect(
      serializeCssRules(
        [
          rule(A, { priority: 900, media: MEDIA }),
          rule(B, { priority: 900, media: { type: 'screen', clauses: [{ min: 600, max: 959.98 }] } }),
        ],
        '\n',
      ),
    ).toBe(
      `@media screen and (min-width: 600px) and (max-width: 959.98px) {\n  /* flex-layout-codemod:rule id=${A} */\n  .flm-${A} {\n    display: flex;\n  }\n  /* flex-layout-codemod:rule id=${B} */\n  .flm-${B} {\n    display: flex;\n  }\n}`,
    );
  });

  test('keeps equal media with different priorities in separate adjacent blocks', () => {
    expect(
      serializeCssRules([rule(A, { priority: 900, media: MEDIA }), rule(B, { priority: 800, media: MEDIA })], '\n'),
    ).toBe(
      `@media screen and (min-width: 600px) and (max-width: 959.98px) {\n  /* flex-layout-codemod:rule id=${A} */\n  .flm-${A} {\n    display: flex;\n  }\n}\n@media screen and (min-width: 600px) and (max-width: 959.98px) {\n  /* flex-layout-codemod:rule id=${B} */\n  .flm-${B} {\n    display: flex;\n  }\n}`,
    );
  });

  test('does not regroup matching contexts across another rule', () => {
    expect(
      serializeCssRules(
        [rule(A, { priority: 900, media: MEDIA }), rule(C), rule(B, { priority: 900, media: MEDIA }), rule(D)],
        '\n',
      ),
    ).toBe(
      `@media screen and (min-width: 600px) and (max-width: 959.98px) {\n  /* flex-layout-codemod:rule id=${A} */\n  .flm-${A} {\n    display: flex;\n  }\n}\n/* flex-layout-codemod:rule id=${C} */\n.flm-${C} {\n  display: flex;\n}\n@media screen and (min-width: 600px) and (max-width: 959.98px) {\n  /* flex-layout-codemod:rule id=${B} */\n  .flm-${B} {\n    display: flex;\n  }\n}\n/* flex-layout-codemod:rule id=${D} */\n.flm-${D} {\n  display: flex;\n}`,
    );
  });

  test('rejects a newline outside the artifact contract', () => {
    expect(() => serializeCssRules([rule(A)], '\r' as never)).toThrow(
      expect.objectContaining({ code: 'invalid-artifact' }),
    );
  });
});
