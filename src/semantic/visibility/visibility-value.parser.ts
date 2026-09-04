import type { LocatedFlexLayoutInput } from '../../analyzer/flex-layout-attribute.analyzer';
import type { VisibilityIntent } from './visibility.model';

const invariantMessage = 'Visibility value parser requires a literal fxShow or fxHide input.';

export function parseVisibilityValue(input: LocatedFlexLayoutInput): VisibilityIntent {
  if (input.binding !== 'literal' || (input.directive !== 'fxShow' && input.directive !== 'fxHide')) {
    throw new Error(invariantMessage);
  }

  const shown = input.value !== 'false';
  return input.directive === 'fxHide' ? (shown ? 'hidden' : 'shown') : shown ? 'shown' : 'hidden';
}
