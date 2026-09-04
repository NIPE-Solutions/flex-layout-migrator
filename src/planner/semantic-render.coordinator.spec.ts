import type { PlannedConversion } from '../adapter/conversion-adapter';
import type { LocatedFlexLayoutInput } from '../analyzer/flex-layout-attribute.analyzer';
import { MigrationApplicationError } from '../migrator/migration-application.error';
import type { ConversionRenderer } from '../render/conversion-renderer';
import type { SemanticConversionContext } from '../semantic/conversion-context';
import { ElementSemanticPlanner } from '../semantic/element-semantic.planner';
import type { ResolvedSemanticPlan } from '../semantic/semantic-plan';
import type { TemplateElement } from '../template/template.model';
import { SemanticRenderCoordinator } from './semantic-render.coordinator';

type InitialMutation = (plans: readonly ResolvedSemanticPlan[]) => readonly ResolvedSemanticPlan[];
type ConflictMutation = (plans: readonly PlannedConversion[]) => readonly PlannedConversion[];

const element: TemplateElement = {
  id: 'element',
  name: 'div',
  source: { start: 0, end: 0 },
  startTag: { start: 0, end: 0 },
  structural: false,
  attributes: [],
};

describe('SemanticRenderCoordinator result integrity', () => {
  test.each([
    {
      label: 'dropped',
      mutate: ((plans: readonly ResolvedSemanticPlan[]) => plans.slice(0, 1)) satisfies InitialMutation,
      message:
        'Initial target rendering returned 1 result for 2 inputs; results must be one-to-one and in stable order.',
    },
    {
      label: 'added',
      mutate: ((plans: readonly ResolvedSemanticPlan[]) => [
        ...plans,
        resolved(input({ id: 'fixture:added' })),
      ]) satisfies InitialMutation,
      message:
        'Initial target rendering returned 3 results for 2 inputs; results must be one-to-one and in stable order.',
    },
    {
      label: 'reordered',
      mutate: ((plans: readonly ResolvedSemanticPlan[]) => [plans[1]!, plans[0]!]) satisfies InitialMutation,
      message: 'Initial target rendering returned input ID "fixture:second" at index 0; expected "fixture:first".',
    },
    {
      label: 'duplicated',
      mutate: ((plans: readonly ResolvedSemanticPlan[]) => [plans[0]!, plans[0]!]) satisfies InitialMutation,
      message: 'Initial target rendering returned duplicate input ID "fixture:first".',
    },
    {
      label: 'wrong-ID',
      mutate: ((plans: readonly ResolvedSemanticPlan[]) => [
        plans[0]!,
        resolved({ ...plans[1]!.input, id: 'fixture:wrong' }),
      ]) satisfies InitialMutation,
      message: 'Initial target rendering returned input ID "fixture:wrong" at index 1; expected "fixture:second".',
    },
    {
      label: 'replaced-identity',
      mutate: ((plans: readonly ResolvedSemanticPlan[]) => [
        plans[0]!,
        resolved({ ...plans[1]!.input }),
      ]) satisfies InitialMutation,
      message: 'Initial target rendering replaced the input identity for ID "fixture:second" at index 1.',
    },
  ])('fails closed on $label initial outcomes', ({ mutate, message }) => {
    const inputs = fixtureInputs();
    const semanticPlanner = semanticPlannerReturning(mutate(inputs.map(resolved)));
    const coordinator = new SemanticRenderCoordinator(new BoundaryRenderer(), semanticPlanner);

    const error = captureInternalInvariant(() => coordinator.planElement(inputs, context(inputs), false));

    expect(error.message).toBe(message);
    expect(error.paths).toEqual(['fixture.html']);
  });

  test.each([
    {
      label: 'dropped',
      mutate: ((plans: readonly PlannedConversion[]) => plans.slice(0, 1)) satisfies ConflictMutation,
      message:
        'Target conflict resolution returned 1 result for 2 inputs; results must be one-to-one and in stable order.',
    },
    {
      label: 'added',
      mutate: ((plans: readonly PlannedConversion[]) => [
        ...plans,
        converted(input({ id: 'fixture:added' })),
      ]) satisfies ConflictMutation,
      message:
        'Target conflict resolution returned 3 results for 2 inputs; results must be one-to-one and in stable order.',
    },
    {
      label: 'reordered',
      mutate: ((plans: readonly PlannedConversion[]) => [plans[1]!, plans[0]!]) satisfies ConflictMutation,
      message: 'Target conflict resolution returned input ID "fixture:second" at index 0; expected "fixture:first".',
    },
    {
      label: 'duplicated',
      mutate: ((plans: readonly PlannedConversion[]) => [plans[0]!, plans[0]!]) satisfies ConflictMutation,
      message: 'Target conflict resolution returned duplicate input ID "fixture:first".',
    },
    {
      label: 'wrong-ID',
      mutate: ((plans: readonly PlannedConversion[]) => [
        plans[0]!,
        converted({ ...plans[1]!.input, id: 'fixture:wrong' }),
      ]) satisfies ConflictMutation,
      message: 'Target conflict resolution returned input ID "fixture:wrong" at index 1; expected "fixture:second".',
    },
    {
      label: 'replaced-identity',
      mutate: ((plans: readonly PlannedConversion[]) => [
        plans[0]!,
        converted({ ...plans[1]!.input }),
      ]) satisfies ConflictMutation,
      message: 'Target conflict resolution replaced the input identity for ID "fixture:second" at index 1.',
    },
  ])('fails closed on $label conflict outcomes', ({ mutate, message }) => {
    const inputs = fixtureInputs();
    const semanticPlanner = semanticPlannerReturning(inputs.map(resolved));
    const coordinator = new SemanticRenderCoordinator(new BoundaryRenderer(mutate), semanticPlanner);

    const error = captureInternalInvariant(() => coordinator.planElement(inputs, context(inputs), false));

    expect(error.message).toBe(message);
    expect(error.paths).toEqual(['fixture.html']);
  });

  test('rejects duplicate coordinator input IDs before target work', () => {
    const inputs = fixtureInputs();
    const duplicate = { ...inputs[1]!, id: inputs[0]!.id };
    const duplicateInputs = [inputs[0]!, duplicate];
    const coordinator = new SemanticRenderCoordinator(
      new BoundaryRenderer(),
      semanticPlannerReturning(duplicateInputs.map(resolved)),
    );

    const error = captureInternalInvariant(() => coordinator.planElement(duplicateInputs, context(duplicateInputs)));

    expect(error.message).toBe('Semantic render inputs contain duplicate ID "fixture:first".');
    expect(error.paths).toEqual(['fixture.html']);
  });
});

class BoundaryRenderer implements ConversionRenderer {
  readonly target = 'tailwind' as const;

  constructor(private readonly resolve: ConflictMutation = plans => plans) {}

  eligibility(): PlannedConversion | undefined {
    return undefined;
  }

  render(plan: ResolvedSemanticPlan): PlannedConversion {
    return converted(plan.input);
  }

  resolveConflicts(plans: readonly PlannedConversion[]): readonly PlannedConversion[] {
    return this.resolve(plans);
  }

  record(): void {}
}

function semanticPlannerReturning(plans: readonly ResolvedSemanticPlan[]): ElementSemanticPlanner {
  const planner = new ElementSemanticPlanner();
  vi.spyOn(planner, 'plan').mockReturnValue(plans);
  return planner;
}

function resolved(subject: LocatedFlexLayoutInput): ResolvedSemanticPlan {
  return {
    status: 'converted',
    input: subject,
    family: 'layout',
    value: {
      direction: 'row',
      wrap: 'nowrap',
      explicitWrap: false,
      display: 'flex',
      boxSizing: 'border-box',
    },
    activations: [{ kind: 'base' }],
  };
}

function converted(subject: LocatedFlexLayoutInput): PlannedConversion {
  return { status: 'converted', input: subject, classNames: [] };
}

function fixtureInputs(): readonly LocatedFlexLayoutInput[] {
  return [input({ id: 'fixture:first' }), input({ id: 'fixture:second', source: { start: 2, end: 3 } })];
}

function context(inputs: readonly LocatedFlexLayoutInput[]): SemanticConversionContext {
  return { element, inputs, parentInputs: [], existingClassNames: [], attributeEvidence: [] };
}

function input(overrides: Partial<LocatedFlexLayoutInput> = {}): LocatedFlexLayoutInput {
  return {
    id: overrides.id ?? 'fixture:input',
    fileName: overrides.fileName ?? 'fixture.html',
    elementId: overrides.elementId ?? element.id,
    directive: overrides.directive ?? 'fxLayout',
    sourceName: overrides.sourceName ?? 'fxLayout',
    binding: overrides.binding ?? 'literal',
    breakpoint: overrides.breakpoint,
    value: overrides.value ?? 'row',
    source: overrides.source ?? { start: 0, end: 1 },
    nameSource: overrides.nameSource ?? { start: 0, end: 1 },
  };
}

function captureInternalInvariant(action: () => unknown): MigrationApplicationError {
  try {
    action();
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(MigrationApplicationError);
    expect(error).toMatchObject({ code: 'internal-invariant' });
    return error as MigrationApplicationError;
  }
  throw new Error('Expected an internal invariant error.');
}
