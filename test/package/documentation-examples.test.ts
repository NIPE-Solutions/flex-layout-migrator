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
});
