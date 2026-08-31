import type { LocatedFlexLayoutInput } from '../../analyzer/flex-layout-attribute.analyzer';
import type { ConversionContext } from '../conversion-adapter';
import { planLayoutAlign } from './directives/layout-align.strategy';
import { planLayout } from './directives/layout.strategy';

export class TailwindClassPlanner {
  plan(input: LocatedFlexLayoutInput, context: ConversionContext): readonly string[] | undefined {
    switch (input.directive) {
      case 'fxLayout': {
        const planned = planLayout(input.value);
        return planned.ok ? planned.value.classNames : undefined;
      }
      case 'fxLayoutAlign': {
        const layout = context.element.attributes.find(
          attribute => attribute.name === 'fxLayout' && attribute.binding === 'literal',
        );
        const planned = planLayoutAlign(input.value, layout?.value ?? 'row');
        return planned.ok ? planned.value.classNames : undefined;
      }
      default:
        return undefined;
    }
  }
}
