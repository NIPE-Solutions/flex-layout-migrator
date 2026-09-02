import type { CssLength } from '../../../flex/css-length';
import { planFlexOffset, renderFlexOffset } from './flex-offset.strategy';

describe('planFlexOffset', () => {
  test.each([
    ['', 'row', ['ms-[0%]']],
    ['4', 'row', ['ms-[4%]']],
    ['10px', 'row-reverse', ['ms-[10px]']],
    ['2rem', 'column', ['mt-[2rem]']],
    ['25%', 'column-reverse', ['mt-[25%]']],
  ] as const)('maps %j in %j without using the theme scale', (value, layout, classNames) => {
    expect(planFlexOffset(value, layout)).toEqual({ status: 'converted', classNames });
  });

  test('preserves an offset with dynamic parent context', () => {
    expect(planFlexOffset('4', undefined)).toMatchObject({ status: 'review', code: 'context-unverified' });
  });

  test.each(['wide', '1;display:none'])('rejects %j', value => {
    expect(planFlexOffset(value, 'row')).toEqual({ status: 'invalid', code: 'invalid-value' });
  });
});

test('renders a planned block-start offset with arbitrary-value escaping', () => {
  expect(renderFlexOffset({ axis: 'block-start', length: 'calc(1rem + 2px)' as CssLength })).toEqual({
    status: 'converted',
    classNames: ['mt-[calc(1rem_+_2px)]'],
  });
});
