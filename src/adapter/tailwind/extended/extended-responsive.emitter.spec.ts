import type { LocatedFlexLayoutInput } from '../../../analyzer/flex-layout-attribute.analyzer';
import { BreakpointCatalog } from '../../../breakpoint/breakpoint-catalog';
import { ExtendedResponsiveEmitter } from './extended-responsive.emitter';
import type { ExtendedResponsiveState, ResponsiveClassValue } from './responsive-class.model';
import { parseResponsiveStyleValue } from './responsive-style-value.parser';
import type { ResponsiveStyleValue } from './responsive-style.model';

function input(
  directive: 'ngClass' | 'ngStyle',
  alias: string,
  value: string,
  id = `fixture:${directive}.${alias}`,
): LocatedFlexLayoutInput {
  return {
    id,
    fileName: 'fixture.html',
    elementId: '0',
    sourceName: `${directive}.${alias}`,
    directive,
    value,
    binding: 'literal',
    breakpoint: alias,
    source: { start: 0, end: 1 },
    nameSource: { start: 0, end: 1 },
  };
}

function definition(alias: string) {
  const classification = new BreakpointCatalog().classify(alias);
  if (classification.kind !== 'verified') throw new Error(`Expected ${alias} to be verified.`);
  return classification.definition;
}

function classState(alias: string, tokens: readonly string[]): ExtendedResponsiveState<ResponsiveClassValue> {
  return {
    input: input('ngClass', alias, tokens.join(' ')),
    activation: { kind: 'media', definition: definition(alias) },
    value: { tokens },
  };
}

function styleState(alias: string, value: string): ExtendedResponsiveState<ResponsiveStyleValue> {
  const member = input('ngStyle', alias, value);
  const parsed = parseResponsiveStyleValue(member);
  if (parsed.status !== 'parsed') throw new Error(`Expected the style fixture to parse: ${parsed.reason}`);
  return {
    input: member,
    activation: { kind: 'media', definition: definition(alias) },
    value: parsed.value,
  };
}

describe('ExtendedResponsiveEmitter', () => {
  const emitter = new ExtendedResponsiveEmitter();

  test.each([
    ['bounded', 'sm', '[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:flex'],
    ['min-only', 'gt-xs', '[@media_screen_and_(min-width:_600px)]:flex'],
    ['max-only', 'lt-sm', '[@media_screen_and_(max-width:_599.98px)]:flex'],
  ])('emits an exact %s class activation', (_case, alias, expected) => {
    expect(emitter.emitClass(classState(alias, ['flex']))).toEqual([expected]);
  });

  test('places exact media before ordinary variants and preserves important, negative, and arbitrary candidates', () => {
    expect(
      emitter.emitClass(
        classState('sm', [
          'dark:hover:text-white',
          '!flex',
          '-mt-2',
          'w-[17px]',
          '[color:#334155]',
          '[--card-gap:1rem]',
        ]),
      ),
    ).toEqual([
      '[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:dark:hover:text-white',
      '[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:!flex',
      '[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:-mt-2',
      '[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:w-[17px]',
      '[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:[color:#334155]',
      '[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:[--card-gap:1rem]',
    ]);
  });

  test('suppresses duplicate class candidates without changing first-seen order', () => {
    expect(emitter.emitClass(classState('gt-lg', ['grid', 'grid', 'items-center']))).toEqual([
      '[@media_screen_and_(min-width:_1920px)]:grid',
      '[@media_screen_and_(min-width:_1920px)]:items-center',
    ]);
  });

  test('emits ordinary, custom, unit-suffixed, and multiple style declarations in declaration order', () => {
    expect(
      emitter.emitStyle(
        styleState('lt-md', 'font-size.px: 14; color: #334155; --Card_Gap: 1rem; width: calc(100% - 1rem)'),
      ),
    ).toEqual([
      '[@media_screen_and_(max-width:_959.98px)]:[font-size:14px]',
      '[@media_screen_and_(max-width:_959.98px)]:[color:#334155]',
      '[@media_screen_and_(max-width:_959.98px)]:[--Card_Gap:1rem]',
      '[@media_screen_and_(max-width:_959.98px)]:[width:calc(100%_-_1rem)]',
    ]);
  });

  test('suppresses byte-identical encoded style candidates', () => {
    const state: ExtendedResponsiveState<ResponsiveStyleValue> = {
      input: input('ngStyle', 'xs', 'color:red;color:red'),
      activation: { kind: 'media', definition: definition('xs') },
      value: {
        declarations: [
          { property: 'color', value: 'red' },
          { property: 'color', value: 'red' },
        ],
      },
    };

    expect(emitter.emitStyle(state)).toEqual([
      '[@media_screen_and_(min-width:_0px)_and_(max-width:_599.98px)]:[color:red]',
    ]);
  });
});
