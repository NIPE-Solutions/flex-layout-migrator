import { planFlexFill, renderFlexFill } from './flex-fill.strategy';

test('emits every style shared by fxFill and fxFlexFill', () => {
  expect(planFlexFill()).toEqual({
    status: 'converted',
    classNames: ['m-0', 'w-full', 'h-full', 'min-w-full', 'min-h-full'],
  });
});

test('renders the target encoding for planned fill dimensions', () => {
  expect(renderFlexFill({ margin: '0', width: '100%', height: '100%', minWidth: '100%', minHeight: '100%' })).toEqual({
    status: 'converted',
    classNames: ['m-0', 'w-full', 'h-full', 'min-w-full', 'min-h-full'],
  });
});
