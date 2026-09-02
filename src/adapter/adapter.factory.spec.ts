import { AdapterFactory } from './adapter.factory';
import { TailwindAdapter } from './tailwind/tailwind.adapter';

const element = {
  id: '0',
  name: 'div',
  source: { start: 0, end: 5 },
  startTag: { start: 0, end: 5 },
  structural: false,
  attributes: [],
} as const;

const layoutInput = {
  id: 'fixture:0',
  fileName: 'fixture.html',
  elementId: '0',
  sourceName: 'fxLayout',
  directive: 'fxLayout',
  value: 'row',
  binding: 'literal',
  breakpoint: undefined,
  source: { start: 0, end: 14 },
  nameSource: { start: 0, end: 8 },
} as const;

describe('AdapterFactory', () => {
  test('creates the Tailwind adapter', () => {
    expect(AdapterFactory.create('tailwind')).toBeInstanceOf(TailwindAdapter);
  });

  test('creates the Tailwind adapter with breakpoint migration configuration', () => {
    expect(
      AdapterFactory.create('tailwind', {
        orientationBreakpoints: true,
        printWithBreakpoints: Object.freeze(['md']),
      }),
    ).toBeInstanceOf(TailwindAdapter);
  });

  test('rejects unknown targets', () => {
    expect(() => AdapterFactory.create('unknown')).toThrow('Adapter [unknown] not found');
  });

  test('creates and finalizes one Tailwind adapter session without changing its output', () => {
    const session = AdapterFactory.createSession('tailwind', { orientationBreakpoints: false });

    expect(session.adapter.plan(layoutInput, { element })).toEqual({
      status: 'converted',
      input: layoutInput,
      classNames: ['flex', 'flex-row', 'box-border'],
    });
    expect(session.finalize()).toEqual({ target: 'tailwind' });
    expect(() => session.finalize()).toThrow('already finalized');
    expect(() => session.adapter.plan(layoutInput, { element })).toThrow('finalized');
  });

  test('creates one CSS session with invocation-owned rules and a single-use lifecycle', () => {
    const session = AdapterFactory.createSession('css', { orientationBreakpoints: false });

    const plan = session.adapter.plan(layoutInput, { element });
    const finalized = session.finalize();

    expect(finalized).toMatchObject({ target: 'css' });
    expect(finalized.target === 'css' ? finalized.rules : []).toHaveLength(1);
    expect(plan.status === 'converted' ? plan.classNames : []).toEqual([
      finalized.target === 'css' ? finalized.rules[0]?.className : undefined,
    ]);
    expect(() => session.finalize()).toThrow('already finalized');
    expect(() => session.adapter.plan(layoutInput, { element })).toThrow('finalized');
  });

  test('rejects unknown session targets with the existing error contract', () => {
    expect(() => AdapterFactory.createSession('unknown')).toThrow('Adapter [unknown] not found');
  });
});
