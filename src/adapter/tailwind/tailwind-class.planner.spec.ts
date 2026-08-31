import type { LocatedFlexLayoutInput } from '../../analyzer/flex-layout-attribute.analyzer';
import type { TemplateElement } from '../../template/template.model';
import { TailwindClassPlanner } from './tailwind-class.planner';

const element: TemplateElement = {
  id: '0',
  name: 'div',
  startTag: { start: 0, end: 5 },
  attributes: [],
};

function layoutElement(id: string, direction: 'row' | 'column'): TemplateElement {
  return {
    id,
    name: 'div',
    startTag: { start: 0, end: 5 },
    attributes: [
      {
        name: 'fxLayout',
        value: direction,
        binding: 'literal',
        source: { start: 0, end: 1 },
        nameSource: { start: 0, end: 1 },
      },
    ],
  };
}

function input(directive: LocatedFlexLayoutInput['directive'], value: string): LocatedFlexLayoutInput {
  return {
    id: `fixture:${directive}`,
    fileName: 'fixture.html',
    elementId: element.id,
    sourceName: directive,
    directive,
    value,
    binding: 'literal',
    breakpoint: undefined,
    source: { start: 0, end: 1 },
    nameSource: { start: 0, end: 1 },
  };
}

describe('TailwindClassPlanner', () => {
  test.each([
    ['fxLayout', 'row', ['flex', 'flex-row', 'box-border']],
    ['fxLayout', 'column wrap', ['flex', 'flex-col', 'flex-wrap', 'box-border']],
    ['fxLayout', 'row inline', ['inline-flex', 'flex-row', 'box-border']],
    ['fxFlexFill', '', ['w-full', 'min-w-full', 'h-full', 'min-h-full']],
    ['fxFlexOrder', '2', ['order-2']],
  ] as const)('plans %s="%s" as classes', (directive, value, expected) => {
    expect(new TailwindClassPlanner().plan(input(directive, value), { element })).toEqual(expected);
  });

  test.each([
    ['30%', ['flex-[30%]']],
    ['0 1 30%', ['flex-[0_1_30%]']],
    ['1 1 0%', ['flex-1']],
    ['', ['flex']],
  ] as const)('plans fxFlex="%s"', (value, expected) => {
    expect(new TailwindClassPlanner().plan(input('fxFlex', value), { element })).toEqual(expected);
  });

  test('maps layout alignment to the main and cross axes', () => {
    const column = layoutElement('0', 'column');

    expect(
      new TailwindClassPlanner().plan(input('fxLayoutAlign', 'center end'), {
        element: column,
      }),
    ).toEqual(['justify-center', 'items-end', 'content-end', 'flex', 'flex-col', 'box-border']);
  });

  test.each([
    ['row', ['ltr:ml-4', 'rtl:mr-4']],
    ['column', ['mt-4']],
  ] as const)('plans flex offset for a %s parent', (direction, expected) => {
    expect(
      new TailwindClassPlanner().plan(input('fxFlexOffset', '4'), {
        element,
        parent: layoutElement('parent', direction),
      }),
    ).toEqual(expected);
  });
});
