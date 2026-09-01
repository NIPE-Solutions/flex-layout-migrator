import type { LocatedFlexLayoutInput } from '../../../analyzer/flex-layout-attribute.analyzer';
import type { TemplateAttribute } from '../../../template/template.model';
import { templateAttributeKeys } from '../../../template/template-attribute';
import type { PlannedConversion } from '../../conversion-adapter';
import {
  describeTailwindUtility,
  findTailwindClassConflicts,
  type TailwindUtilityDescriptor,
} from '../tailwind-class-conflict';
import { parseLiteralStyleDeclarations } from '../visibility/literal-style-display';
import { ExtendedResponsiveEmitter } from './extended-responsive.emitter';
import type { ExtendedFamilyPlan, ExtendedResponsiveState, ResponsiveClassValue } from './responsive-class.model';
import type { ResponsiveStyleValue } from './responsive-style.model';
import { TailwindCandidateClassifier } from './tailwind-candidate-classifier';
import { cssPropertiesOverlap } from './css-property-ownership';

interface ExtendedResponsiveRequestBase {
  readonly existingClassNames: readonly string[];
  readonly attributes: readonly TemplateAttribute[];
}

export type ExtendedResponsivePlanRequest =
  | (ExtendedResponsiveRequestBase & {
      readonly kind: 'class';
      readonly familyPlan: ExtendedFamilyPlan<ResponsiveClassValue>;
    })
  | (ExtendedResponsiveRequestBase & {
      readonly kind: 'style';
      readonly familyPlan: ExtendedFamilyPlan<ResponsiveStyleValue>;
    });

export type ExtendedResponsivePlan =
  | { readonly status: 'converted'; readonly plans: readonly PlannedConversion[] }
  | { readonly status: 'unresolved'; readonly plans: readonly PlannedConversion[] };

type OwnedTailwindUtilityDescriptor = Omit<TailwindUtilityDescriptor, 'propertyGroup'> & {
  readonly propertyGroup: string;
};

interface EmittedCandidate {
  readonly token: string;
  readonly descriptor: OwnedTailwindUtilityDescriptor;
  readonly input: LocatedFlexLayoutInput;
}

type AnyExtendedState = ExtendedResponsiveState<ResponsiveClassValue> | ExtendedResponsiveState<ResponsiveStyleValue>;

type EmissionResult =
  | { readonly status: 'emitted'; readonly candidates: readonly EmittedCandidate[] }
  | {
      readonly status: 'unverified';
      readonly input: LocatedFlexLayoutInput;
      readonly code: 'tailwind-candidate-unverified' | 'style-value-unverified';
      readonly reason: string;
    };

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

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

function hasPropertyOwnership(
  descriptor: TailwindUtilityDescriptor | undefined,
): descriptor is OwnedTailwindUtilityDescriptor {
  return descriptor?.propertyGroup !== undefined;
}

function diagnostic(
  input: LocatedFlexLayoutInput,
  code: 'bound-class' | 'class-conflict' | 'tailwind-candidate-unverified' | 'style-value-unverified',
  reason: string,
  suggestion: string,
): PlannedConversion {
  return { status: 'review', input, code, reason, suggestion };
}

export class ExtendedResponsivePlanner {
  constructor(
    private readonly emitter = new ExtendedResponsiveEmitter(),
    private readonly classifier = new TailwindCandidateClassifier(),
  ) {}

  plan(request: ExtendedResponsivePlanRequest): ExtendedResponsivePlan {
    if (request.familyPlan.status === 'unresolved') {
      return { status: 'unresolved', plans: request.familyPlan.plans };
    }

    let states: readonly AnyExtendedState[];
    let emission: EmissionResult;
    if (request.kind === 'class') {
      const classStates = this.canonicalStates(request.familyPlan.states);
      states = classStates;
      emission = this.emitClass(classStates);
    } else {
      const styleStates = this.canonicalStates(request.familyPlan.states);
      states = styleStates;
      emission = this.emitStyle(styleStates);
    }
    if (emission.status === 'unverified') {
      return {
        status: 'unresolved',
        plans: states.map(state =>
          diagnostic(
            state.input,
            emission.code,
            emission.reason,
            'Keep the complete responsive family or replace the unverified value before migration.',
          ),
        ),
      };
    }

    const candidates = emission.candidates;
    const generatedClassNames = [...new Set(candidates.map(candidate => candidate.token))];
    if (generatedClassNames.length > 0 && request.attributes.some(boundClassAuthority)) {
      return this.unresolved(
        states,
        'bound-class',
        'Generated responsive classes cannot be merged safely with a bound class value.',
        'Merge the generated classes into the class binding manually.',
      );
    }

    if (request.kind === 'style' && generatedClassNames.length > 0) {
      if (request.attributes.some(boundStyleAuthority)) {
        return this.unresolved(
          states,
          'class-conflict',
          'A bound style authority may control a property generated by this responsive style family.',
          'Remove or reconcile the bound style before migrating this family.',
        );
      }

      const generatedProperties = new Set(
        request.familyPlan.states.flatMap(state => state.value.declarations.map(declaration => declaration.property)),
      );
      if (this.literalStyleConflicts(request.attributes, generatedProperties)) {
        return this.unresolved(
          states,
          'class-conflict',
          'A literal fallback style may control a property generated by this responsive style family.',
          'Remove or reconcile the overlapping fallback declaration before migrating this family.',
        );
      }
    }

    if (findTailwindClassConflicts(request.existingClassNames, generatedClassNames).size > 0) {
      return this.unresolved(
        states,
        'class-conflict',
        'An existing Tailwind utility controls a CSS property generated by this responsive family.',
        'Remove or reconcile the conflicting utility before migrating this family.',
      );
    }

    const existing = new Set(request.existingClassNames);
    const classNames = generatedClassNames.filter(className => !existing.has(className));
    const plans = states.map((state, index): PlannedConversion => ({
      status: 'converted',
      input: state.input,
      classNames: index === 0 ? classNames : [],
    }));
    return { status: 'converted', plans };
  }

  private canonicalStates<T>(states: readonly ExtendedResponsiveState<T>[]): readonly ExtendedResponsiveState<T>[] {
    return [...states].sort((left, right) => {
      const priority = right.activation.definition.priority - left.activation.definition.priority;
      if (priority) return priority;
      const alias = compareText(left.activation.definition.alias, right.activation.definition.alias);
      return alias || compareText(left.input.id, right.input.id);
    });
  }

  private emitClass(states: readonly ExtendedResponsiveState<ResponsiveClassValue>[]): EmissionResult {
    const candidates: EmittedCandidate[] = [];

    for (const state of states) {
      const uniqueTokens = [...new Set(state.value.tokens)];
      const descriptors: OwnedTailwindUtilityDescriptor[] = [];
      for (const token of uniqueTokens) {
        const classification = this.classifier.classify(token);
        if (classification.status !== 'verified' || !hasPropertyOwnership(classification.descriptor)) {
          return {
            status: 'unverified',
            input: state.input,
            code: 'tailwind-candidate-unverified',
            reason: `The class token ${JSON.stringify(token)} is not a verified Tailwind candidate with stable property ownership.`,
          };
        }
        descriptors.push(classification.descriptor);
      }

      const classNames = this.emitter.emitClass({ ...state, value: { tokens: uniqueTokens } });
      for (const [index, token] of classNames.entries()) {
        const sourceDescriptor = descriptors[index];
        const generatedDescriptor = describeTailwindUtility(token);
        if (
          sourceDescriptor === undefined ||
          !hasPropertyOwnership(generatedDescriptor) ||
          generatedDescriptor.propertyGroup !== sourceDescriptor.propertyGroup
        ) {
          return {
            status: 'unverified',
            input: state.input,
            code: 'tailwind-candidate-unverified',
            reason: 'Responsive class emission lost its verified property descriptor.',
          };
        }
        candidates.push({ token, descriptor: generatedDescriptor, input: state.input });
      }
    }

    return { status: 'emitted', candidates };
  }

  private emitStyle(states: readonly ExtendedResponsiveState<ResponsiveStyleValue>[]): EmissionResult {
    const candidates: EmittedCandidate[] = [];

    for (const state of states) {
      for (const token of this.emitter.emitStyle(state)) {
        const descriptor = describeTailwindUtility(token);
        if (!hasPropertyOwnership(descriptor)) {
          return {
            status: 'unverified',
            input: state.input,
            code: 'style-value-unverified',
            reason: 'Responsive style emission lost its verified property descriptor.',
          };
        }
        candidates.push({ token, descriptor, input: state.input });
      }
    }

    return { status: 'emitted', candidates };
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
  ): ExtendedResponsivePlan {
    return {
      status: 'unresolved',
      plans: states.map(state => diagnostic(state.input, code, reason, suggestion)),
    };
  }
}
