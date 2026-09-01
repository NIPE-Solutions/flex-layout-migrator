import type { LocatedFlexLayoutInput } from '../../analyzer/flex-layout-attribute.analyzer';
import { BreakpointCatalog } from '../../breakpoint/breakpoint-catalog';
import { ResponsiveVariantEmitter } from './responsive-variant.emitter';
import type { TailwindStrategyResult } from './tailwind-semantic.model';

export function planResponsiveClasses(
  input: LocatedFlexLayoutInput,
  classNames: readonly string[],
  catalog: BreakpointCatalog,
  emitter: ResponsiveVariantEmitter,
): TailwindStrategyResult {
  if (input.binding === 'property') {
    return {
      status: 'review',
      code: 'dynamic-binding',
      reason: 'Angular property bindings may depend on runtime state.',
      suggestion: 'Replace the binding manually or make it a literal before migration.',
    };
  }

  if (!input.breakpoint) return { status: 'converted', classNames };

  const classification = catalog.classify(input.breakpoint);
  if (classification.kind === 'verified') {
    return {
      status: 'converted',
      classNames: classNames.map(className => emitter.emit(classification.definition, className)),
    };
  }

  if (classification.kind === 'custom') {
    return {
      status: 'review',
      code: 'custom-breakpoint',
      reason: `The breakpoint alias ${classification.alias} may be registered by the project.`,
      suggestion: 'Provide its media query or migrate this responsive input manually.',
    };
  }

  const alias = classification.alias;
  const kind = classification.kind === 'print' ? 'print' : 'optional';
  return {
    status: 'review',
    code: 'breakpoint-unverified',
    reason: `Exact media-query output for the ${kind} breakpoint alias ${alias} is not implemented.`,
    suggestion: 'Keep the responsive directive until exact breakpoint support is available.',
  };
}
