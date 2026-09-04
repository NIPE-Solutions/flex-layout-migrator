import type { LocatedFlexLayoutInput } from '../../../analyzer/flex-layout-attribute.analyzer';
import { BreakpointCatalog } from '../../../breakpoint/breakpoint-catalog';
import type { VisibilityIntent, VisibilityState } from '../../../semantic/visibility/visibility.model';
import { VisibilityEmitter } from './visibility.emitter';

function input(breakpoint?: string): LocatedFlexLayoutInput {
  const sourceName = `fxShow${breakpoint === undefined ? '' : `.${breakpoint}`}`;
  return {
    id: `fixture:${sourceName}`,
    fileName: 'fixture.html',
    elementId: '0',
    sourceName,
    directive: 'fxShow',
    value: '',
    binding: 'literal',
    breakpoint,
    source: { start: 0, end: 1 },
    nameSource: { start: 0, end: 1 },
  };
}

function state(intent: VisibilityIntent, breakpoint?: string): VisibilityState {
  const member = input(breakpoint);
  if (breakpoint === undefined) return { input: member, intent, activation: { kind: 'base' } };
  const classification = new BreakpointCatalog().classify(breakpoint);
  if (classification.kind !== 'verified') throw new Error(`Expected ${breakpoint} to be verified.`);
  return { input: member, intent, activation: { kind: 'media', definition: classification.definition } };
}

describe('VisibilityEmitter', () => {
  test('emits hidden for a base hidden state', () => {
    expect(new VisibilityEmitter().emit(state('hidden'), undefined)).toEqual(['hidden']);
  });

  test('decorates hidden with the exact responsive activation', () => {
    expect(new VisibilityEmitter().emit(state('hidden', 'sm'), undefined)).toEqual([
      '[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:hidden',
    ]);
  });

  test('decorates a proven restoration utility for a responsive shown state', () => {
    expect(new VisibilityEmitter().emit(state('shown', 'gt-xs'), 'inline-flex')).toEqual([
      '[@media_screen_and_(min-width:_600px)]:inline-flex',
    ]);
  });

  test('emits no restoration token when no restoration utility is required', () => {
    expect(new VisibilityEmitter().emit(state('shown', 'lt-sm'), undefined)).toEqual([]);
  });
});
