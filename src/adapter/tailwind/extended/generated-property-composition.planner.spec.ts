import type { LocatedFlexLayoutInput } from '../../../analyzer/flex-layout-attribute.analyzer';
import { BreakpointCatalog } from '../../../breakpoint/breakpoint-catalog';
import type { PlannedConversion } from '../../conversion-adapter';
import { ResponsiveVariantEmitter } from '../responsive-variant.emitter';
import { GeneratedPropertyCompositionPlanner } from './generated-property-composition.planner';

const catalog = new BreakpointCatalog();
const emitter = new ResponsiveVariantEmitter();

function responsive(alias: string, utility: string): string {
  const classification = catalog.classify(alias);
  if (classification.kind !== 'verified') throw new Error(`Expected ${alias} to be verified.`);
  return emitter.emit(classification.definition, utility);
}

function converted(
  directive: LocatedFlexLayoutInput['directive'],
  alias: string,
  value: string,
  classNames: readonly string[],
  index: number,
): PlannedConversion {
  return {
    status: 'converted',
    input: {
      id: `fixture:${directive}.${alias}:${index}`,
      fileName: 'fixture.html',
      elementId: '0',
      sourceName: `${directive}.${alias}`,
      directive,
      value,
      binding: 'literal',
      breakpoint: alias,
      source: { start: index, end: index + 1 },
      nameSource: { start: index, end: index + 1 },
    },
    classNames,
  };
}

describe('GeneratedPropertyCompositionPlanner', () => {
  test.each([
    {
      name: 'responsive ngStyle owns an exactly covered ngClass property',
      plans: [
        converted('ngClass', 'sm', 'text-red-500', [responsive('sm', 'text-red-500')], 0),
        converted('ngStyle', 'sm', 'color:blue', [responsive('sm', '[color:blue]')], 1),
      ],
      statuses: ['converted', 'converted'],
      classNames: [[], [responsive('sm', '[color:blue]')]],
    },
    {
      name: 'responsive layout owns an exactly covered ngClass property',
      plans: [
        converted('fxLayout', 'sm', 'column', [responsive('sm', 'flex-col')], 0),
        converted('ngClass', 'sm', 'flex-row', [responsive('sm', 'flex-row')], 1),
      ],
      statuses: ['converted', 'converted'],
      classNames: [[responsive('sm', 'flex-col')], []],
    },
    {
      name: 'competing inline writers preserve both families',
      plans: [
        converted('fxLayout', 'sm', 'column', [responsive('sm', 'flex-col')], 0),
        converted('ngStyle', 'sm', 'flex-direction:row', [responsive('sm', '[flex-direction:row]')], 1),
      ],
      statuses: ['review', 'review'],
      classNames: [undefined, undefined],
    },
    {
      name: 'partial class and inline ranges preserve both families atomically',
      plans: [
        converted('fxLayout', 'lt-sm', 'column', [responsive('lt-sm', 'flex-col')], 0),
        converted('ngClass', 'lt-md', 'flex-row', [responsive('lt-md', 'flex-row')], 1),
        converted('ngClass', 'sm', 'text-red-500', [], 2),
      ],
      statuses: ['review', 'review', 'review'],
      classNames: [undefined, undefined, undefined],
    },
  ] as const)('$name', ({ plans, statuses, classNames }) => {
    const result = new GeneratedPropertyCompositionPlanner().compose(plans);

    expect(result.map(plan => plan.status)).toEqual(statuses);
    expect(result.map(plan => (plan.status === 'converted' ? plan.classNames : undefined))).toEqual(classNames);
  });

  test('preserves an intrinsic authority diagnostic before closing an overlapping generated family', () => {
    const unresolvedClass = {
      status: 'review' as const,
      input: converted('ngClass', 'sm', 'card', [], 0).input,
      code: 'tailwind-candidate-unverified' as const,
      reason: 'The class is not compiler-proven.',
      suggestion: 'Keep the class family.',
    };
    const style = converted('ngStyle', 'sm', 'color:red', [responsive('sm', '[color:red]')], 1);

    const result = new GeneratedPropertyCompositionPlanner().compose([unresolvedClass, style]);

    expect(result[0]).toEqual(unresolvedClass);
    expect(result[1]).toMatchObject({ status: 'review', code: 'context-unverified' });
  });
});
