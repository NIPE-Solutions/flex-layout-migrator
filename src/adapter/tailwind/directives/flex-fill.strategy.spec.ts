import { planFlexFill } from './flex-fill.strategy';

test('emits every style shared by fxFill and fxFlexFill', () => {
  expect(planFlexFill()).toEqual({
    status: 'converted',
    classNames: ['m-0', 'w-full', 'h-full', 'min-w-full', 'min-h-full'],
  });
});
