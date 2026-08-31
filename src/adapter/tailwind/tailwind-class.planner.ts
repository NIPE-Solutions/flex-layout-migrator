import type { LocatedFlexLayoutInput } from '../../analyzer/flex-layout-attribute.analyzer';
import type { ConversionContext } from '../conversion-adapter';
import { isArbitraryValue } from '../../util/value.util';
import { planLayoutAlign } from './directives/layout-align.strategy';
import { planLayout } from './directives/layout.strategy';

function utility(prefix: string, value: string): string {
  return `${prefix}-${isArbitraryValue(value) ? `[${value}]` : value}`;
}

export class TailwindClassPlanner {
  plan(input: LocatedFlexLayoutInput, context: ConversionContext): readonly string[] | undefined {
    const values = input.value.split(/\s+/).filter(Boolean);

    switch (input.directive) {
      case 'fxLayout': {
        const planned = planLayout(input.value);
        return planned.ok ? planned.value.classNames : undefined;
      }
      case 'fxFlexFill':
        return ['w-full', 'min-w-full', 'h-full', 'min-h-full'];
      case 'fxFlexOrder': {
        const [order = 'first'] = values;
        return [utility('order', order)];
      }
      case 'fxLayoutAlign': {
        const layout = context.element.attributes.find(
          attribute => attribute.name === 'fxLayout' && attribute.binding === 'literal',
        );
        const planned = planLayoutAlign(input.value, layout?.value ?? 'row');
        return planned.ok ? planned.value.classNames : undefined;
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
