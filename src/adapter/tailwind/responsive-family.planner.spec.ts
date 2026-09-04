import type { LocatedFlexLayoutInput } from '../../analyzer/flex-layout-attribute.analyzer';
import type { PlannedConversion } from '../conversion-adapter';
import { ResponsiveFamilyPlanner } from './responsive-family.planner';

const element = {
  id: '0',
  name: 'div',
  source: { start: 0, end: 5 },
  startTag: { start: 0, end: 5 },
  structural: false,
  attributes: [],
} as const;

function input(sourceName: string, value: string): LocatedFlexLayoutInput {
  const breakpoint = sourceName.includes('.')
    ? sourceName.slice(sourceName.indexOf('.') + 1).replaceAll(']', '')
    : undefined;
  return {
    id: `fixture:${sourceName}`,
    fileName: 'fixture.html',
    elementId: '0',
    sourceName,
    directive: 'fxFlexAlign',
    value,
    binding: sourceName.startsWith('[') ? 'property' : 'literal',
    breakpoint,
    source: { start: 0, end: 1 },
    nameSource: { start: 0, end: 1 },
  };
}

function planOne(item: LocatedFlexLayoutInput): PlannedConversion {
  return { status: 'converted', input: item, classNames: [`self-${item.value}`] };
}

describe('ResponsiveFamilyPlanner', () => {
  test('decorates a base member and verified responsive override with Tailwind candidates', () => {
    const inputs = [input('fxFlexAlign', 'start'), input('fxFlexAlign.sm', 'end')];

    expect(new ResponsiveFamilyPlanner().plan(inputs, { element, inputs }, planOne)).toEqual([
      expect.objectContaining({ status: 'converted', classNames: ['self-start'] }),
      expect.objectContaining({
        status: 'converted',
        classNames: ['[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:self-end'],
      }),
    ]);
  });
});
