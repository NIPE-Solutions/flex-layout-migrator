import type { LocatedFlexLayoutInput } from '../../analyzer/flex-layout-attribute.analyzer';
import type { ConversionContext } from '../conversion-adapter';
import { isArbitraryValue } from '../../util/value.util';

function utility(prefix: string, value: string): string {
  return `${prefix}-${isArbitraryValue(value) ? `[${value}]` : value}`;
}

export class TailwindClassPlanner {
  plan(input: LocatedFlexLayoutInput, context: ConversionContext): readonly string[] | undefined {
    const values = input.value.split(/\s+/).filter(Boolean);

    switch (input.directive) {
      case 'fxLayout': {
        const [direction = 'row', wrap] = values;
        if (!['row', 'row-reverse', 'column', 'column-reverse'].includes(direction)) return undefined;
        if (wrap && !['nowrap', 'wrap', 'wrap-reverse'].includes(wrap)) return undefined;
        const directionUtility = (
          {
            row: 'row',
            'row-reverse': 'row-reverse',
            column: 'col',
            'column-reverse': 'col-reverse',
          } as const
        )[direction as 'row' | 'row-reverse' | 'column' | 'column-reverse'];
        return ['flex', utility('flex', directionUtility), ...(wrap ? [utility('flex', wrap)] : [])];
      }
      case 'fxLayoutGap': {
        const [gap = '0', grid] = values;
        return [utility('gap', gap), ...(grid ? ['grid'] : [])];
      }
      case 'fxFlexFill':
        return ['w-full', 'min-w-full', 'h-full', 'min-h-full'];
      case 'fxFlexOrder': {
        const [order = 'first'] = values;
        return [utility('order', order)];
      }
      case 'fxFlex': {
        if (!values.length) return ['flex'];
        if (values.length === 1) return [utility('flex', values[0] ?? 'initial')];

        const shorthand = values.slice(0, 3).join('_');
        const mapped = {
          '0_1_auto': 'initial',
          '1_1_0': '1',
          '1_1_0%': '1',
          '1_1_auto': 'auto',
        }[shorthand];
        return [utility('flex', mapped ?? `[${shorthand}]`)];
      }
      case 'fxLayoutAlign': {
        const [mainAxis = 'start', crossAxis = 'stretch'] = values;
        const mainAxisValue = {
          start: 'start',
          'flex-start': 'start',
          center: 'center',
          end: 'end',
          'flex-end': 'end',
          'space-around': 'around',
          'space-between': 'between',
          'space-evenly': 'evenly',
        }[mainAxis];
        const crossAxisValue = {
          start: 'start',
          'flex-start': 'start',
          center: 'center',
          end: 'end',
          'flex-end': 'end',
          stretch: 'stretch',
          baseline: 'baseline',
        }[crossAxis];
        if (!mainAxisValue || !crossAxisValue) return undefined;
        return [utility('justify', mainAxisValue), utility('items', crossAxisValue)];
      }
      case 'fxFlexOffset': {
        const [offset = '0'] = values;
        const direction = context.parent?.attributes.find(attribute => attribute.name === 'fxLayout')?.value ?? 'row';
        return direction.startsWith('column')
          ? [utility('mt', offset)]
          : [`ltr:${utility('ml', offset)}`, `rtl:${utility('mr', offset)}`];
      }
      default:
        return undefined;
    }
  }
}
