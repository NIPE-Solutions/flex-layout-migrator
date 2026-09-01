import type { LocatedFlexLayoutInput } from '../../../analyzer/flex-layout-attribute.analyzer';
import type { PlannedConversion } from '../../conversion-adapter';
import { AngularTemplateParser } from '../../../template/angular-template.parser';
import type { VisibilityActivation, VisibilityIntent, VisibilityState } from './visibility.model';
import { VisibleDisplayResolver, type VisibleDisplayRequest } from './visible-display.resolver';

const sm = (utility: string) => `[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:${utility}`;
const xs = (utility: string) => `[@media_screen_and_(min-width:_0px)_and_(max-width:_599.98px)]:${utility}`;
const gtXs = (utility: string) => `[@media_screen_and_(min-width:_600px)]:${utility}`;

function input(directive: LocatedFlexLayoutInput['directive'], breakpoint?: string): LocatedFlexLayoutInput {
  const sourceName = `${directive}${breakpoint === undefined ? '' : `.${breakpoint}`}`;
  return {
    id: `fixture:${sourceName}`,
    fileName: 'fixture.html',
    elementId: '0',
    sourceName,
    directive,
    value: directive === 'fxLayout' ? 'row' : '',
    binding: 'literal',
    breakpoint,
    source: { start: 0, end: 1 },
    nameSource: { start: 0, end: 1 },
  };
}

function state(intent: VisibilityIntent, activation: VisibilityActivation = { kind: 'base' }): VisibilityState {
  const breakpoint = activation.kind === 'media' ? activation.definition.alias : undefined;
  return { input: input('fxShow', breakpoint), intent, activation };
}

function mediaState(intent: VisibilityIntent, alias: 'xs' | 'sm'): VisibilityState {
  return state(intent, {
    kind: 'media',
    definition:
      alias === 'xs'
        ? { alias: 'xs', range: { min: 0, max: 599.98 }, priority: 1000 }
        : { alias: 'sm', range: { min: 600, max: 959.98 }, priority: 900 },
  });
}

function layout(classNames: readonly string[], breakpoint?: string): PlannedConversion {
  return { status: 'converted', input: input('fxLayout', breakpoint), classNames };
}

function parsedAttributes(source: string) {
  const result = new AngularTemplateParser().parse(source, 'fixture.html');
  if (result.status !== 'parsed') throw new Error('Expected the attribute fixture to parse.');
  const element = result.elements[0];
  if (!element) throw new Error('Expected the attribute fixture to contain one element.');
  return element.attributes;
}

function request(overrides: Partial<VisibleDisplayRequest> = {}): VisibleDisplayRequest {
  return {
    states: [state('hidden'), mediaState('shown', 'sm')],
    layoutPlans: [],
    existingClassNames: [],
    attributes: [],
    ...overrides,
  };
}

const resolve = (overrides: Partial<VisibleDisplayRequest> = {}) =>
  new VisibleDisplayResolver().resolve(request(overrides));

describe('VisibleDisplayResolver', () => {
  test('restores flex from a converted base layout', () => {
    expect(resolve({ layoutPlans: [layout(['flex', 'flex-row', 'box-border'])] })).toEqual({
      status: 'resolved',
      utility: 'flex',
    });
  });

  test('restores inline-flex from a converted layout in the shown activation range', () => {
    expect(resolve({ layoutPlans: [layout([sm('inline-flex'), sm('flex-row')], 'sm')] })).toEqual({
      status: 'resolved',
      utility: 'inline-flex',
    });
  });

  test('does not guess from a converted layout in another activation range', () => {
    expect(resolve({ layoutPlans: [layout([xs('flex'), xs('flex-row')], 'xs')] })).toMatchObject({
      status: 'unverified',
    });
  });

  test('does not fall back to a base layout when another layout range overlaps the shown activation', () => {
    expect(
      resolve({
        layoutPlans: [layout(['flex']), layout([gtXs('inline-flex')], 'gt-xs')],
      }),
    ).toMatchObject({ status: 'unverified' });
  });

  test('does not treat an ordinary-variant layout display as an applicable base value', () => {
    expect(resolve({ layoutPlans: [layout(['hover:flex'])] })).toMatchObject({ status: 'unverified' });
  });

  test.each([
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
  ])('restores the one plain base display utility %s', utility => {
    expect(resolve({ existingClassNames: [utility, 'text-sm'] })).toEqual({
      status: 'resolved',
      utility,
    });
  });

  test.each([{ states: [state('shown')] }, { states: [state('hidden')] }, { states: [mediaState('hidden', 'sm')] }])(
    'does not emit a restoration utility when no hidden-to-shown override exists',
    ({ states }) => {
      expect(resolve({ states })).toEqual({ status: 'resolved', utility: undefined });
    },
  );

  test('leaves an unknown restoration unresolved instead of guessing a default display', () => {
    expect(resolve()).toMatchObject({ status: 'unverified' });
  });

  test('accepts an existing hidden utility only when every effective state is hidden', () => {
    expect(resolve({ states: [state('hidden')], existingClassNames: ['hidden'] })).toEqual({
      status: 'resolved',
      utility: undefined,
    });
  });

  test.each([
    { states: [state('shown')] },
    { states: [mediaState('hidden', 'sm')] },
    { states: [state('hidden'), mediaState('shown', 'sm')] },
  ])('rejects hidden when the element is effectively shown in any range', ({ states }) => {
    expect(resolve({ states, existingClassNames: ['hidden'] })).toMatchObject({ status: 'unverified' });
  });

  test.each([
    ['block', 'flex'],
    ['block', sm('grid')],
  ])('rejects multiple or activation-modified display utilities: %s %s', (...existingClassNames) => {
    expect(resolve({ existingClassNames })).toMatchObject({ status: 'unverified' });
  });

  test.each(['hover:block', 'sm:grid'])('rejects the variant-prefixed display utility %s', utility => {
    expect(resolve({ existingClassNames: [utility] })).toMatchObject({ status: 'unverified' });
  });

  test.each(['!block', 'inline-flex!'])('rejects the important display utility %s', utility => {
    expect(resolve({ existingClassNames: [utility] })).toMatchObject({ status: 'unverified' });
  });

  test('rejects an arbitrary display utility as an unverified restoration value', () => {
    expect(resolve({ existingClassNames: ['[display:block]'] })).toMatchObject({ status: 'unverified' });
  });

  test('rejects ambiguous applicable layout display values', () => {
    expect(resolve({ layoutPlans: [layout(['flex']), layout(['inline-flex'])] })).toMatchObject({
      status: 'unverified',
    });
  });

  test('does not fall back to a static class when applicable layout display values are ambiguous', () => {
    expect(
      resolve({
        layoutPlans: [layout([sm('flex')], 'sm'), layout([sm('inline-flex')], 'sm')],
        existingClassNames: ['block'],
      }),
    ).toMatchObject({ status: 'unverified' });
  });

  test.each(['<div style="color: red; display: block"></div>', '<div STYLE="display:block"></div>'])(
    'blocks a parser-produced literal inline display declaration in %s',
    source => {
      expect(resolve({ states: [state('shown')], attributes: parsedAttributes(source) })).toMatchObject({
        status: 'unverified',
      });
    },
  );

  test.each([
    '<div [style]="styles"></div>',
    '<div [ngStyle]="styles"></div>',
    '<div [style.display]="display"></div>',
    '<div [style.display.important]="display"></div>',
    '<div [attr.style]="styles"></div>',
    '<div bind-style="styles"></div>',
    '<div bind-style.display="display"></div>',
    '<div bind-attr.style="styles"></div>',
  ])('blocks the parser-produced bound display-controlling attribute in %s', source => {
    expect(resolve({ existingClassNames: ['block'], attributes: parsedAttributes(source) })).toMatchObject({
      status: 'unverified',
    });
  });

  test.each([
    '<div [class]="classes"></div>',
    '<div [ngClass]="classes"></div>',
    '<div [class.hidden]="isHidden"></div>',
    '<div [attr.class]="classes"></div>',
    '<div bind-class="classes"></div>',
    '<div bind-ngClass="classes"></div>',
    '<div bind-class.hidden="isHidden"></div>',
    '<div bind-attr.class="classes"></div>',
  ])('blocks parser-produced bound classes when hiding generates a class: %s', source => {
    expect(resolve({ states: [mediaState('hidden', 'sm')], attributes: parsedAttributes(source) })).toMatchObject({
      status: 'unverified',
    });
  });

  test('allows bound classes when an always-shown family is a safe no-op', () => {
    expect(
      resolve({ states: [state('shown')], attributes: parsedAttributes('<div [class]="classes"></div>') }),
    ).toEqual({
      status: 'resolved',
      utility: undefined,
    });
  });

  test('blocks a bound class when overriding an existing hidden utility requires restoration output', () => {
    expect(
      resolve({
        states: [state('shown')],
        existingClassNames: ['hidden'],
        attributes: parsedAttributes('<div [class]="classes"></div>'),
      }),
    ).toEqual({
      status: 'unverified',
      reason: 'Generated visibility classes cannot be merged safely with a bound class value.',
    });
  });
});
