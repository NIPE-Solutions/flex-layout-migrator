import type { PlannedConversion } from '../render/conversion-renderer';
import type { LocatedFlexLayoutInput } from '../analyzer/flex-layout-attribute.analyzer';
import type { DiagnosticCode } from '../analyzer/conversion-result';
import { ORIENTATION_BREAKPOINTS } from '../analyzer/flex-layout.catalog';
import { BreakpointCatalog, type BreakpointDefinition } from '../breakpoint/breakpoint-catalog';
import { compareCodeUnits } from '../util/compare-code-units';
import type {
  ResponsiveImageContext,
  ResponsiveImagePlanningResult,
  ResponsiveImageSource,
} from './responsive-image.model';
import { validateSingleSrcsetUrl } from './srcset-value';

interface Failure {
  readonly status: 'review' | 'unsupported' | 'invalid';
  readonly code: DiagnosticCode;
  readonly reason: string;
  readonly suggestion: string;
}

const standardAliases = new Set([
  'xs',
  'sm',
  'md',
  'lg',
  'xl',
  'lt-sm',
  'lt-md',
  'lt-lg',
  'lt-xl',
  'gt-xs',
  'gt-sm',
  'gt-md',
  'gt-lg',
]);
const optionalAliases = new Set<string>(ORIENTATION_BREAKPOINTS);

function unresolved(inputs: readonly LocatedFlexLayoutInput[], failure: Failure): ResponsiveImagePlanningResult {
  return {
    status: 'unresolved',
    plans: inputs.map(
      input =>
        ({
          ...failure,
          input,
        }) satisfies PlannedConversion,
    ),
  };
}

function breakpointFailure(alias: string): Failure {
  if (alias.length === 0 || (!optionalAliases.has(alias) && alias !== 'print')) {
    return {
      status: 'unsupported',
      code: 'custom-breakpoint',
      reason: `Responsive image breakpoint "${alias}" is not a standard viewport alias.`,
      suggestion: 'Migrate the responsive image source manually.',
    };
  }
  return {
    status: 'unsupported',
    code: 'breakpoint-unverified',
    reason: `Responsive image breakpoint "${alias}" is not supported by native image migration.`,
    suggestion: 'Keep this responsive image family unchanged.',
  };
}

export class ResponsiveImagePlanner {
  private readonly catalog = new BreakpointCatalog();

  plan(
    inputs: readonly LocatedFlexLayoutInput[],
    context: ResponsiveImageContext,
    enabled: boolean,
  ): ResponsiveImagePlanningResult {
    if (!enabled) {
      return unresolved(inputs, {
        status: 'unsupported',
        code: 'target-unsupported',
        reason: 'Responsive image migration is not enabled.',
        suggestion: 'Rerun with --responsive-images after reviewing picture-wrapper selector risk.',
      });
    }

    if (context.element.name.toLowerCase() !== 'img') {
      return unresolved(inputs, {
        status: 'review',
        code: 'context-unverified',
        reason: 'Responsive image inputs are only safe to migrate on an img element.',
        suggestion: 'Remove or migrate the input manually.',
      });
    }
    if (context.element.structural || context.ancestors.some(ancestor => ancestor.name.toLowerCase() === 'picture')) {
      return unresolved(inputs, {
        status: 'review',
        code: 'context-unverified',
        reason: 'The image has structural syntax or is already inside a picture element.',
        suggestion: 'Keep this responsive image family unchanged.',
      });
    }
    if (
      context.element.source.start !== context.element.startTag.start ||
      context.element.source.end < context.element.startTag.end
    ) {
      return unresolved(inputs, {
        status: 'review',
        code: 'context-unverified',
        reason: 'The image does not have one unambiguous replacement range.',
        suggestion: 'Keep this responsive image family unchanged.',
      });
    }
    if (inputs.some(input => input.binding !== 'literal')) {
      return unresolved(inputs, {
        status: 'review',
        code: 'dynamic-binding',
        reason: 'Dynamic responsive image sources cannot become literal source elements.',
        suggestion: 'Keep the binding or replace it with a literal URL before migrating.',
      });
    }

    const aliases = inputs.map(input => input.breakpoint ?? '');
    const unsupportedAlias = aliases.find(alias => !standardAliases.has(alias));
    if (unsupportedAlias !== undefined) return unresolved(inputs, breakpointFailure(unsupportedAlias));
    if (new Set(aliases).size !== aliases.length) {
      return unresolved(inputs, {
        status: 'review',
        code: 'responsive-precedence-unverified',
        reason: 'More than one responsive image input owns the same breakpoint.',
        suggestion: 'Remove duplicate responsive image inputs before migrating.',
      });
    }

    const sources: ResponsiveImageSource[] = [];
    for (const input of inputs) {
      const validation = validateSingleSrcsetUrl(input.value);
      if (validation.status === 'invalid') {
        return unresolved(inputs, {
          status: 'invalid',
          code: 'invalid-value',
          reason: validation.reason,
          suggestion: 'Use one literal, descriptor-free URL or migrate this image manually.',
        });
      }
      const classification = this.catalog.classify(input.breakpoint ?? '');
      if (classification.kind !== 'verified') {
        return unresolved(inputs, breakpointFailure(input.breakpoint ?? ''));
      }
      sources.push({ input, definition: classification.definition as BreakpointDefinition, url: validation.value });
    }

    const fallbackAttributes = context.element.attributes.filter(attribute => attribute.name === 'src');
    const literalFallback = fallbackAttributes.filter(
      attribute => attribute.binding === 'literal' && attribute.rawName.toLowerCase() === 'src',
    );
    const boundFallback = fallbackAttributes.filter(
      attribute =>
        attribute.binding === 'property' &&
        attribute.bindingTarget === 'property' &&
        attribute.rawName.toLowerCase() === '[src]',
    );
    if (fallbackAttributes.length !== literalFallback.length + boundFallback.length || fallbackAttributes.length > 1) {
      return unresolved(inputs, {
        status: 'review',
        code: 'context-unverified',
        reason: 'The fallback image source has conflicting or unsupported ownership.',
        suggestion: 'Keep one literal src or property [src] fallback before migrating.',
      });
    }

    sources.sort(
      (left, right) =>
        right.definition.priority - left.definition.priority ||
        compareCodeUnits(left.definition.alias, right.definition.alias),
    );
    return {
      status: 'converted',
      plan: {
        element: context.element,
        sources,
        fallback: literalFallback.length ? 'literal' : boundFallback.length ? 'bound' : 'absent',
      },
    };
  }
}
