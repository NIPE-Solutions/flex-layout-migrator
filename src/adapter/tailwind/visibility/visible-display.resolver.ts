import type { PlannedConversion } from '../../conversion-adapter';
import type { LocatedFlexLayoutInput } from '../../../analyzer/flex-layout-attribute.analyzer';
import { mediaRangesIntersect } from '../../../breakpoint/breakpoint-catalog';
import type { TemplateAttribute } from '../../../template/template.model';
import { templateAttributeKeys } from '../../../template/template-attribute';
import {
  describeTailwindDisplay,
  type TailwindActivation,
  type TailwindDisplayUtility,
} from '../tailwind-class-conflict';
import type { VisibilityActivation, VisibilityState } from './visibility.model';
import { literalStyleMayControlDisplay } from './literal-style-display';

export type VisibleDisplayResolution =
  | { readonly status: 'resolved'; readonly utility?: string }
  | { readonly status: 'unverified'; readonly reason: string };

export interface VisibleDisplayRequest {
  readonly states: readonly VisibilityState[];
  readonly layoutPlans: readonly PlannedConversion[];
  readonly existingClassNames: readonly string[];
  readonly attributes: readonly TemplateAttribute[];
  readonly responsiveStyleInputs?: readonly LocatedFlexLayoutInput[];
}

const restorationUtilities = new Set([
  'inline',
  'block',
  'inline-block',
  'flow-root',
  'flex',
  'inline-flex',
  'grid',
  'inline-grid',
  'contents',
  'table',
  'inline-table',
  'table-caption',
  'table-cell',
  'table-column',
  'table-column-group',
  'table-footer-group',
  'table-header-group',
  'table-row-group',
  'table-row',
  'list-item',
]);

const unverifiedStyleReason = 'A literal or bound style may control the element display value.';
const unverifiedClassReason = 'Generated visibility classes cannot be merged safely with a bound class value.';
const unverifiedDisplayReason = 'The visible display value cannot be proven from one unambiguous source.';

function controlsDisplay(attribute: TemplateAttribute): boolean {
  const keys = templateAttributeKeys(attribute);
  if (attribute.binding === 'literal') {
    return keys.has('style') && literalStyleMayControlDisplay(attribute.value);
  }

  return [...keys].some(
    key => key === 'style' || key === 'ngstyle' || key === 'style.display' || key.startsWith('style.display.'),
  );
}

function controlsClasses(attribute: TemplateAttribute): boolean {
  if (attribute.binding !== 'property') return false;
  return [...templateAttributeKeys(attribute)].some(
    key => key === 'class' || key === 'ngclass' || key.startsWith('class.') || key.startsWith('ngclass.'),
  );
}

function sameActivation(left: TailwindActivation, right: VisibilityActivation): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === 'base' || right.kind === 'base') return true;
  return left.range.min === right.definition.range.min && left.range.max === right.definition.range.max;
}

function isPlainBase(descriptor: TailwindDisplayUtility): boolean {
  return descriptor.activation.kind === 'base' && !descriptor.important && descriptor.token === descriptor.utility;
}

function layoutDisplays(plans: readonly PlannedConversion[]): readonly TailwindDisplayUtility[] {
  return plans
    .filter(
      (plan): plan is Extract<PlannedConversion, { readonly status: 'converted' }> =>
        plan.status === 'converted' && plan.input.directive === 'fxLayout',
    )
    .flatMap(plan => plan.classNames.map(describeTailwindDisplay).filter(descriptor => descriptor !== undefined))
    .filter(
      descriptor =>
        (descriptor.utility === 'flex' || descriptor.utility === 'inline-flex') &&
        !descriptor.important &&
        (descriptor.activation.kind === 'media' || descriptor.token === descriptor.utility),
    );
}

function matchingLayoutUtility(
  displays: readonly TailwindDisplayUtility[],
  state: VisibilityState,
): string | null | undefined {
  if (state.activation.kind === 'media') {
    const stateRange = state.activation.definition.range;
    const hasOverlappingLayout = displays.some(
      display =>
        display.activation.kind === 'media' &&
        !sameActivation(display.activation, state.activation) &&
        mediaRangesIntersect(display.activation.range, stateRange),
    );
    if (hasOverlappingLayout) return null;
  }

  const exact = displays.filter(display => sameActivation(display.activation, state.activation));
  const applicable = exact.length > 0 ? exact : displays.filter(display => display.activation.kind === 'base');
  if (applicable.length === 0) return undefined;
  const utilities = [...new Set(applicable.map(display => display.utility))];
  return utilities.length === 1 ? utilities[0] : null;
}

function existingRestorationUtility(descriptors: readonly TailwindDisplayUtility[]): string | undefined {
  if (descriptors.length !== 1) return undefined;
  const descriptor = descriptors[0];
  if (!descriptor || !isPlainBase(descriptor) || !restorationUtilities.has(descriptor.utility)) return undefined;
  return descriptor.utility;
}

export class VisibleDisplayResolver {
  resolve(request: VisibleDisplayRequest): VisibleDisplayResolution {
    if (request.responsiveStyleInputs?.length || request.attributes.some(controlsDisplay)) {
      return { status: 'unverified', reason: unverifiedStyleReason };
    }

    const baseIsHidden = request.states.some(state => state.activation.kind === 'base' && state.intent === 'hidden');
    const shownOverrides = baseIsHidden
      ? request.states.filter(state => state.activation.kind === 'media' && state.intent === 'shown')
      : [];
    const displayDescriptors = request.existingClassNames
      .map(describeTailwindDisplay)
      .filter(descriptor => descriptor !== undefined);
    const hasEffectiveShownRange = !baseIsHidden || request.states.some(state => state.intent === 'shown');
    const classOutputRequired =
      request.states.some(state => state.intent === 'hidden') ||
      (hasEffectiveShownRange && displayDescriptors.some(descriptor => descriptor.utility === 'hidden'));

    if (classOutputRequired && request.attributes.some(controlsClasses)) {
      return { status: 'unverified', reason: unverifiedClassReason };
    }

    if (displayDescriptors.some(descriptor => descriptor.utility === 'hidden')) {
      return hasEffectiveShownRange
        ? { status: 'unverified', reason: unverifiedDisplayReason }
        : { status: 'resolved', utility: undefined };
    }

    if (shownOverrides.length === 0) return { status: 'resolved', utility: undefined };

    const displays = layoutDisplays(request.layoutPlans);
    const existingUtility = existingRestorationUtility(displayDescriptors);
    const utilities = shownOverrides.map(state => {
      const layoutUtility = matchingLayoutUtility(displays, state);
      return layoutUtility === undefined ? existingUtility : layoutUtility;
    });
    const distinctUtilities = [...new Set(utilities)];
    const utility = distinctUtilities[0];
    if (distinctUtilities.length !== 1 || typeof utility !== 'string') {
      return { status: 'unverified', reason: unverifiedDisplayReason };
    }

    return { status: 'resolved', utility };
  }
}
