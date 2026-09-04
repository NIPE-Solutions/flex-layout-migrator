import { AdapterFactory } from './adapter.factory';
import { CssRenderSession, TailwindRenderSession } from '../render/render-session';

describe('AdapterFactory', () => {
  test('creates the canonical Tailwind render session with breakpoint configuration', () => {
    const session = AdapterFactory.createRenderSession('tailwind', {
      orientationBreakpoints: true,
      printWithBreakpoints: Object.freeze(['md']),
    });

    expect(session).toBeInstanceOf(TailwindRenderSession);
    expect(session.renderer.breakpointConfig).toEqual({
      orientationBreakpoints: true,
      printWithBreakpoints: ['md'],
    });
  });

  test('creates the canonical CSS render session', () => {
    expect(AdapterFactory.createRenderSession('css')).toBeInstanceOf(CssRenderSession);
  });

  test('rejects unknown render-session targets with the existing error contract', () => {
    expect(() => AdapterFactory.createRenderSession('unknown')).toThrow('Adapter [unknown] not found');
  });
});
