import { planFlexFillSemantics } from './flex-fill.semantic';

test('plans the shared zero-margin full-size fill dimensions', () => {
  expect(planFlexFillSemantics()).toEqual({
    status: 'planned',
    value: { margin: '0', width: '100%', height: '100%', minWidth: '100%', minHeight: '100%' },
  });
});
