import type { LocatedFlexLayoutInput } from '../../analyzer/flex-layout-attribute.analyzer';
import type { PlannedConversion } from '../../adapter/conversion-adapter';
import { templateAttributeKeys } from '../../template/template-attribute';
import type { TemplateAttribute } from '../../template/template.model';
import { cssPropertiesOverlap } from '../css-property-ownership';
import { parseLiteralStyleDeclarations } from '../literal-style-declaration';
import type { SourceClassTokenEvidence, SourcePropertyEvidence } from '../source-property-evidence';
import type { ExtendedFamilyPlan, ExtendedResponsiveState } from './responsive-class.model';
import { parseLiteralResponsiveClassValue, type SemanticResponsiveClassValue } from './responsive-class-value.parser';
import type { ResponsiveStyleValue } from './responsive-style.model';
import {
  parseLiteralResponsiveStyleValue,
  responsiveStyleExactKeyAliasReason,
  responsiveStyleValuesHaveExactKeyAliases,
} from './responsive-style-value.parser';

interface ExtendedSemanticRequestBase {
  readonly attributes: readonly TemplateAttribute[];
}

export type ExtendedSemanticPlanRequest =
  | (ExtendedSemanticRequestBase & {
      readonly kind: 'class';
      readonly familyPlan: ExtendedFamilyPlan<SemanticResponsiveClassValue>;
    })
  | (ExtendedSemanticRequestBase & {
      readonly kind: 'style';
      readonly familyPlan: ExtendedFamilyPlan<ResponsiveStyleValue>;
    });

export type ExtendedSemanticPlan =
  | {
      readonly status: 'resolved';
      readonly ownerInputId?: string;
      readonly retainedTokens: readonly SourceClassTokenEvidence[];
    }
  | { readonly status: 'unresolved'; readonly plans: readonly PlannedConversion[] };

type AnyExtendedState =
  ExtendedResponsiveState<SemanticResponsiveClassValue> | ExtendedResponsiveState<ResponsiveStyleValue>;

function boundClassAuthority(attribute: TemplateAttribute): boolean {
  if (attribute.binding !== 'property') return false;
  if (attribute.bindingTarget === 'class') return true;
  return [...templateAttributeKeys(attribute)].some(
    key =>
      key === 'class' ||
      key === 'ngclass' ||
      key === 'attr.class' ||
      key.startsWith('class.') ||
      key.startsWith('ngclass.') ||
      key.startsWith('attr.class.'),
  );
}

function boundStyleAuthority(attribute: TemplateAttribute): boolean {
  if (attribute.binding !== 'property') return false;
  if (attribute.bindingTarget === 'style') return true;
  return [...templateAttributeKeys(attribute)].some(
    key =>
      key === 'style' ||
      key === 'ngstyle' ||
      key === 'attr.style' ||
      key.startsWith('style.') ||
      key.startsWith('ngstyle.') ||
      key.startsWith('attr.style.'),
  );
}

function literalStyleAuthority(attribute: TemplateAttribute): boolean {
  return attribute.binding === 'literal' && templateAttributeKeys(attribute).has('style');
}

function unsuffixedAuthority(
  attributes: readonly TemplateAttribute[],
  key: 'ngclass' | 'ngstyle',
): TemplateAttribute | undefined {
  return attributes.find(attribute => templateAttributeKeys(attribute).has(key));
}

function equalClassValues(left: SemanticResponsiveClassValue, right: SemanticResponsiveClassValue): boolean {
  return (
    left.tokens.length === right.tokens.length &&
    left.tokens.every((token, index) => token.source === right.tokens[index]?.source)
  );
}

function diagnostic(
  input: LocatedFlexLayoutInput,
  code: 'bound-class' | 'class-conflict' | 'tailwind-candidate-unverified' | 'style-value-unverified',
  reason: string,
  suggestion: string,
): PlannedConversion {
  return { status: 'review', input, code, reason, suggestion };
}

export class ExtendedSemanticPlanner {
  constructor(private readonly evidence: SourcePropertyEvidence) {}

  plan(request: ExtendedSemanticPlanRequest): ExtendedSemanticPlan {
    if (request.familyPlan.status === 'unresolved') {
      return { status: 'unresolved', plans: request.familyPlan.plans };
    }
    if (request.kind === 'class') return this.planClass(request.familyPlan.states, request.attributes);
    return this.planStyle(request.familyPlan.states, request.attributes);
  }

  private planClass(
    states: readonly ExtendedResponsiveState<SemanticResponsiveClassValue>[],
    attributes: readonly TemplateAttribute[],
  ): ExtendedSemanticPlan {
    const fallback = unsuffixedAuthority(attributes, 'ngclass');
    if (fallback !== undefined) {
      if (fallback.binding !== 'literal') {
        return this.unresolved(
          states,
          'bound-class',
          'A bound unsuffixed ngClass value is the runtime fallback for this responsive family.',
          'Make the complete ngClass family literal or migrate its replacement behavior manually.',
        );
      }
      const parsed = parseLiteralResponsiveClassValue(fallback.value, this.evidence);
      if (parsed.status === 'unverified') {
        return {
          status: 'unresolved',
          plans: states.map(state =>
            diagnostic(
              state.input,
              'tailwind-candidate-unverified',
              `The unsuffixed ngClass fallback cannot be translated exactly. ${parsed.reason}`,
              'Keep the complete ngClass family or replace the fallback with proven Tailwind candidates.',
            ),
          ),
        };
      }
      if (parsed.value.tokens.length > 0) {
        if (states.every(state => equalClassValues(state.value, parsed.value))) {
          return { status: 'resolved', retainedTokens: parsed.value.tokens };
        }
        return this.unresolved(
          states,
          'class-conflict',
          'The literal unsuffixed ngClass fallback is replaced, not merged, when a responsive value activates.',
          'Migrate the complete ngClass fallback and responsive replacement family manually.',
        );
      }
    }

    const hasOutput = states.some(state => state.value.tokens.length > 0);
    if (hasOutput && attributes.some(boundClassAuthority)) {
      return this.unresolved(
        states,
        'bound-class',
        'Generated responsive classes cannot be merged safely with a bound class value.',
        'Merge the generated classes into the class binding manually.',
      );
    }
    return {
      status: 'resolved',
      ...(hasOutput && states[0] !== undefined ? { ownerInputId: states[0].input.id } : {}),
      retainedTokens: [],
    };
  }

  private planStyle(
    states: readonly ExtendedResponsiveState<ResponsiveStyleValue>[],
    attributes: readonly TemplateAttribute[],
  ): ExtendedSemanticPlan {
    if (responsiveStyleValuesHaveExactKeyAliases(states.map(state => state.input.value))) {
      return {
        status: 'unresolved',
        plans: states.map(state =>
          diagnostic(
            state.input,
            'style-value-unverified',
            responsiveStyleExactKeyAliasReason,
            'Keep the complete responsive style family or normalize its exact property key before migration.',
          ),
        ),
      };
    }
    const fallback = unsuffixedAuthority(attributes, 'ngstyle');
    if (fallback !== undefined) {
      if (fallback.binding !== 'literal') {
        return this.unresolved(
          states,
          'class-conflict',
          'A bound unsuffixed ngStyle value is the runtime fallback for this responsive family.',
          'Make the complete ngStyle family literal or migrate its replacement behavior manually.',
        );
      }
      const parsed = parseLiteralResponsiveStyleValue(fallback.value, this.evidence);
      if (parsed.status === 'unverified') {
        return {
          status: 'unresolved',
          plans: states.map(state =>
            diagnostic(
              state.input,
              'style-value-unverified',
              `The unsuffixed ngStyle fallback cannot be translated exactly. ${parsed.reason}`,
              'Keep the complete ngStyle family or replace the fallback with an exact literal style map.',
            ),
          ),
        };
      }
      if (parsed.value.declarations.length > 0 || fallback.value.length > 0) {
        return this.unresolved(
          states,
          'class-conflict',
          'The literal unsuffixed ngStyle raw-string fallback is replaced at runtime and cannot remain after Flex-Layout is removed.',
          'Translate and remove the complete ngStyle fallback together with its responsive replacement family.',
        );
      }
    }

    const hasOutput = states.some(state => state.value.declarations.length > 0);
    if (hasOutput && attributes.some(boundClassAuthority)) {
      return this.unresolved(
        states,
        'bound-class',
        'Generated responsive classes cannot be merged safely with a bound class value.',
        'Merge the generated classes into the class binding manually.',
      );
    }
    if (hasOutput && attributes.some(boundStyleAuthority)) {
      return this.unresolved(
        states,
        'class-conflict',
        'A bound style authority may control a property generated by this responsive style family.',
        'Remove or reconcile the bound style before migrating this family.',
      );
    }
    const generatedProperties = new Set(
      states.flatMap(state => state.value.declarations.map(declaration => declaration.property)),
    );
    if (hasOutput && this.literalStyleConflicts(attributes, generatedProperties)) {
      return this.unresolved(
        states,
        'class-conflict',
        'A literal fallback style may control a property generated by this responsive style family.',
        'Remove or reconcile the overlapping fallback declaration before migrating this family.',
      );
    }
    return {
      status: 'resolved',
      ...(hasOutput && states[0] !== undefined ? { ownerInputId: states[0].input.id } : {}),
      retainedTokens: [],
    };
  }

  private literalStyleConflicts(
    attributes: readonly TemplateAttribute[],
    generatedProperties: ReadonlySet<string>,
  ): boolean {
    return attributes.filter(literalStyleAuthority).some(attribute => {
      const parsed = parseLiteralStyleDeclarations(attribute.value);
      if (parsed.status === 'unverified') return true;
      return parsed.declarations.some(declaration =>
        [...generatedProperties].some(property => cssPropertiesOverlap(declaration.property, property)),
      );
    });
  }

  private unresolved(
    states: readonly AnyExtendedState[],
    code: 'bound-class' | 'class-conflict',
    reason: string,
    suggestion: string,
  ): ExtendedSemanticPlan {
    return {
      status: 'unresolved',
      plans: states.map(state => diagnostic(state.input, code, reason, suggestion)),
    };
  }
}
