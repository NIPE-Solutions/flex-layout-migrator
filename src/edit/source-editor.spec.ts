import { SourceEditor } from './source-editor';

describe('SourceEditor', () => {
  test('applies replacements from the end of the source', () => {
    const result = new SourceEditor().apply('one two three', [
      { range: { start: 0, end: 3 }, text: '1', inputId: 'first' },
      { range: { start: 8, end: 13 }, text: '3', inputId: 'third' },
    ]);

    expect(result).toEqual({ status: 'applied', output: '1 two 3' });
  });

  test('orders insertions at the same offset by input id', () => {
    const result = new SourceEditor().apply('ab', [
      { range: { start: 1, end: 1 }, text: 'B', inputId: 'second' },
      { range: { start: 1, end: 1 }, text: 'A', inputId: 'first' },
    ]);

    expect(result).toEqual({ status: 'applied', output: 'aABb' });
  });

  test.each([
    [{ start: -1, end: 1 }, 'negative'],
    [{ start: 0.5, end: 1 }, 'fractional'],
    [{ start: 2, end: 1 }, 'reversed'],
    [{ start: 0, end: 4 }, 'out-of-bounds'],
  ])('rejects invalid range %o before editing', (range, inputId) => {
    const result = new SourceEditor().apply('abc', [{ range, text: 'x', inputId }]);

    expect(result).toEqual({
      status: 'invalid',
      diagnostics: [
        {
          code: 'invalid-range',
          message: `Edit ${inputId} has a range outside the source.`,
          inputIds: [inputId],
        },
      ],
    });
  });

  test('rejects overlapping replacements before editing', () => {
    const result = new SourceEditor().apply('abcdef', [
      { range: { start: 1, end: 4 }, text: 'first', inputId: 'first' },
      { range: { start: 3, end: 5 }, text: 'second', inputId: 'second' },
    ]);

    expect(result).toEqual({
      status: 'invalid',
      diagnostics: [
        {
          code: 'overlapping-edits',
          message: 'Edits first and second overlap.',
          inputIds: ['first', 'second'],
        },
      ],
    });
  });

  test('rejects an insertion inside a replacement', () => {
    const result = new SourceEditor().apply('abcdef', [
      { range: { start: 1, end: 5 }, text: 'replacement', inputId: 'replacement' },
      { range: { start: 3, end: 3 }, text: 'insertion', inputId: 'insertion' },
    ]);

    expect(result).toMatchObject({ status: 'invalid' });
  });

  test('returns unchanged source for an empty plan', () => {
    expect(new SourceEditor().apply('unchanged', [])).toEqual({ status: 'applied', output: 'unchanged' });
  });
});
