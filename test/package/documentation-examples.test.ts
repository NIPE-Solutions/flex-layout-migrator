import { previewTemplate } from '../../src/browser/template-preview';
import { verifiedExamples } from '../../website/src/content/example-reference';

describe('published documentation examples', () => {
  test('execute against the production preview engine with exact output, status, and codes', () => {
    for (const example of verifiedExamples) {
      const result = previewTemplate(example.input);
      const publicResults = result.results.map(item =>
        item.status === 'converted' ? { status: item.status } : { status: item.status, code: item.code },
      );

      expect(result.html, example.id).toBe(example.expectedOutput);
      expect(result.css, example.id).toBe(example.expectedCss);
      expect(publicResults, example.id).toEqual(example.expectedResults);
    }
  });

  test('keeps Native CSS non-standard Flex breakpoints and accepts an existing flex class', () => {
    const example = verifiedExamples.find(candidate => candidate.id === 'native-css-flex-target-boundary');
    expect(example).toBeDefined();

    const result = previewTemplate(example!.input);
    expect(result.html).toBe(
      `<div fxLayout.handset="row"></div>\n<div fxLayout.cinema="column"></div>\n<div class="flex flm-5db098b5a4e638fdd1aff69e13d53ea10eb01e6c58577e5ecdf136b90eaee103"></div>\n`,
    );
    expect(
      result.results.map(item =>
        item.status === 'converted' ? { status: item.status } : { status: item.status, code: item.code },
      ),
    ).toEqual([
      { status: 'unsupported', code: 'target-unsupported' },
      { status: 'unsupported', code: 'target-unsupported' },
      { status: 'converted' },
    ]);
  });
});
