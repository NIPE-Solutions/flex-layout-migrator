import { BreakpointCatalog, type BreakpointDefinition } from '../../breakpoint/breakpoint-catalog';
import { cssRuleContext } from './css-breakpoint.context';

const aliases = [
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
] as const;

function verifiedDefinition(alias: (typeof aliases)[number]): BreakpointDefinition {
  const classification = new BreakpointCatalog().classify(alias);

  if (classification.kind !== 'verified') {
    throw new Error(`Expected ${alias} to be a verified breakpoint`);
  }

  return classification.definition;
}

describe('cssRuleContext', () => {
  test('returns the base rule context', () => {
    expect(cssRuleContext()).toEqual({ priority: 0 });
  });

  test.each(aliases)('copies the exact verified %s media definition and priority', alias => {
    const definition = verifiedDefinition(alias);
    const context = cssRuleContext(definition);

    expect(context).toEqual({ media: definition.media, priority: definition.priority });
    expect(context.media).not.toBe(definition.media);
    expect(context.media?.clauses).not.toBe(definition.media.clauses);
    expect(context.media?.clauses[0]).not.toBe(definition.media.clauses[0]);
    expect(Object.isFrozen(context)).toBe(true);
    expect(Object.isFrozen(context.media)).toBe(true);
    expect(Object.isFrozen(context.media?.clauses)).toBe(true);
    expect(Object.isFrozen(context.media?.clauses[0])).toBe(true);
  });
});
