import type { LocatedFlexLayoutInput } from '../../analyzer/flex-layout-attribute.analyzer';
import { isKnownBreakpoint } from '../../analyzer/flex-layout.catalog';
import type { ConversionAdapter, ConversionContext, PlannedConversion } from '../conversion-adapter';
import { TailwindClassPlanner } from './tailwind-class.planner';

const supportedDirectives = new Set<LocatedFlexLayoutInput['directive']>([
  'fxFlex',
  'fxFlexFill',
  'fxFlexOffset',
  'fxFlexOrder',
  'fxLayout',
  'fxLayoutAlign',
  'fxLayoutGap',
]);

export class TailwindAdapter implements ConversionAdapter {
  readonly name = 'tailwind' as const;
  private readonly classPlanner = new TailwindClassPlanner();

  plan(input: LocatedFlexLayoutInput, context: ConversionContext): PlannedConversion {
    if (input.breakpoint && !isKnownBreakpoint(input.breakpoint)) {
      return {
        status: 'review',
        input,
        code: 'custom-breakpoint',
        reason: `The breakpoint alias ${input.breakpoint} may be registered by the project.`,
        suggestion: 'Provide its media query or migrate this responsive input manually.',
      };
    }

    if (input.binding === 'property') {
      return {
        status: 'review',
        input,
        code: 'dynamic-binding',
        reason: 'Angular property bindings may depend on runtime state.',
        suggestion: 'Replace the binding manually or make it a literal before migration.',
      };
    }

    if (input.breakpoint) {
      return {
        status: 'review',
        input,
        code: 'breakpoint-unverified',
        reason: `Exact media-query output for ${input.breakpoint} is not implemented.`,
        suggestion: 'Keep the responsive directive until exact breakpoint support is available.',
      };
    }

    if (!supportedDirectives.has(input.directive)) {
      return {
        status: 'unsupported',
        input,
        code: 'target-unsupported',
        reason: `The Tailwind target does not support ${input.directive}.`,
        suggestion: 'Keep the directive and migrate it manually.',
      };
    }

    const classNames = this.classPlanner.plan(input, context);
    if (!classNames) {
      return {
        status: 'invalid',
        input,
        code: 'invalid-value',
        reason: `${input.value} is not a supported ${input.directive} value.`,
        suggestion: 'Correct the value or migrate this directive manually.',
      };
    }

    return { status: 'converted', input, classNames };
  }
}
