import type { ConversionResult } from '../analyzer/conversion-result';
import { serializeOwnedCssBlock } from '../adapter/css/stylesheet/owned-css-block.serializer';
import { SourceEditor } from '../edit/source-editor';
import { AnalyzeProjectStage } from '../pipeline/analyze/analyze-project.stage';
import { projectManifest } from '../pipeline/project-manifest';
import { RenderProjectStage } from '../pipeline/render/render-project.stage';
import { CssRenderSession, TailwindRenderSession } from '../render/render-session';
import { previewTemplate } from './template-preview';

const literalSource = '<div fxLayout="row" fxLayoutGap="16px"></div>';
const literalTailwind = '<div class="flex flex-row box-border gap-[16px]"></div>';
const cssLayoutClass = 'flm-5db098b5a4e638fdd1aff69e13d53ea10eb01e6c58577e5ecdf136b90eaee103';
const cssGapClass = 'flm-3e641b4d490643e88897a6adcfbc8fa32824a7ff1d324d6d5922d0823e367100';
const literalCss = `/* flex-layout-codemod:start schema=1 */
/* flex-layout-codemod:rule id=3e641b4d490643e88897a6adcfbc8fa32824a7ff1d324d6d5922d0823e367100 */
.${cssGapClass} {
  gap: 16px;
}
/* flex-layout-codemod:rule id=5db098b5a4e638fdd1aff69e13d53ea10eb01e6c58577e5ecdf136b90eaee103 */
.${cssLayoutClass} {
  display: flex;
  box-sizing: border-box;
  flex-direction: row;
}
/* flex-layout-codemod:end */`;

describe('previewTemplate', () => {
  test('migrates literal Flex-Layout directives to literal Tailwind HTML without CSS diagnostics', () => {
    const result = previewTemplate({ source: literalSource, target: 'tailwind' });

    expect(result.html).toBe(literalTailwind);
    expect(result.css).toBeUndefined();
    expect(result.results.map(item => item.status)).toEqual(['converted', 'converted']);
    expect(result.diagnostics).toEqual([]);
  });

  test('migrates responsive directives with the production media variant', () => {
    const result = previewTemplate({
      source: '<div fxLayout="column" fxLayout.gt-sm="row"></div>',
      target: 'tailwind',
    });

    expect(result.html).toBe(
      '<div class="flex flex-col box-border [@media_screen_and_(min-width:_960px)]:flex [@media_screen_and_(min-width:_960px)]:flex-row [@media_screen_and_(min-width:_960px)]:box-border"></div>',
    );
    expect(result.diagnostics).toEqual([]);
  });

  test('migrates Tailwind grid directives through the production renderer', () => {
    const result = previewTemplate({
      source: '<div gdColumns="repeat(3, 1fr)" gdGap="16px"></div>',
      target: 'tailwind',
    });

    expect(result.html).toBe('<div class="grid [grid-template-columns:repeat(3,_1fr)] [grid-gap:16px]"></div>');
    expect(result.results.map(item => item.status)).toEqual(['converted', 'converted']);
  });

  test('returns deterministic native CSS HTML and the referenced owned stylesheet block', () => {
    const first = previewTemplate({ source: literalSource, target: 'css' });
    const second = previewTemplate({ source: literalSource, target: 'css' });

    expect(first.html).toBe(`<div class="${cssLayoutClass} ${cssGapClass}"></div>`);
    expect(first.css).toBe(literalCss);
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
  });

  test('preserves unsupported input and exposes its literal structured diagnostic', () => {
    const source = '<div gdColumns="repeat(3, 1fr)"></div>';
    const result = previewTemplate({ source, target: 'css', fileName: 'grid-card.html' });

    expect(result.html).toBe(source);
    expect(result.css).toBe('');
    expect(result.results).toEqual([
      {
        status: 'unsupported',
        input: {
          sourceName: 'gdColumns',
          value: 'repeat(3, 1fr)',
          directive: 'gdColumns',
          binding: 'literal',
          id: 'grid-card.html:5',
          fileName: 'grid-card.html',
          elementId: '0',
          source: { start: 5, end: 31 },
          nameSource: { start: 5, end: 14 },
          valueSource: { start: 16, end: 30 },
        },
        code: 'target-unsupported',
        reason: 'The CSS target does not support gdColumns.',
        suggestion: 'Use the Tailwind target when it supports this input, or migrate the directive manually.',
      },
    ]);
    expect(result.diagnostics).toEqual([
      {
        code: 'target-unsupported',
        message: 'The CSS target does not support gdColumns.',
        suggestion: 'Use the Tailwind target when it supports this input, or migrate the directive manually.',
        source: { start: 5, end: 31 },
      },
    ]);
  });

  test('preserves invalid Angular source and maps parse failures to results and diagnostics', () => {
    const source = '<div><span></div>';
    const reason =
      'Unexpected closing tag "div". It may happen when the tag has already been closed by another tag. For more info see https://www.w3.org/TR/html5/syntax.html#closing-elements-that-have-implied-end-tags';
    const result = previewTemplate({ source, target: 'tailwind', fileName: 'broken.html' });

    expect(result).toEqual({
      html: source,
      css: undefined,
      results: [
        {
          status: 'parse-error',
          fileName: 'broken.html',
          code: 'template-parse-error',
          reason,
          source: { start: 11, end: 17 },
        },
      ],
      diagnostics: [
        {
          code: 'template-parse-error',
          message: reason,
          source: { start: 11, end: 17 },
        },
      ],
    });
  });

  test('returns unchanged valid input with empty result collections', () => {
    const source = '<section class="hero">Hello</section>';

    expect(previewTemplate({ source, target: 'tailwind' })).toEqual({
      html: source,
      css: undefined,
      results: [],
      diagnostics: [],
    });
  });

  test.each(['tailwind', 'css'] as const)('matches the production pipeline oracle for %s results', async target => {
    const fileName = '/virtual/card.html';
    const source = '<article fxLayout="row" fxLayout.sm="column" fxFlex="25"></article>';
    const expected = await productionPipelineOracle(source, target, fileName);

    const result = previewTemplate({ source, target, fileName });

    expect(result.html).toBe(expected.html);
    expect(result.css).toBe(expected.css);
    expect(result.results).toEqual(expected.results);
  });

  test('deeply freezes the returned aggregate and every exposed nested value', () => {
    const result = previewTemplate({ source: literalSource, target: 'css' });

    expectDeepFrozen(result);
  });
});

async function productionPipelineOracle(
  source: string,
  target: 'tailwind' | 'css',
  fileName: string,
): Promise<{ readonly html: string; readonly css: string | undefined; readonly results: readonly ConversionResult[] }> {
  const manifest = projectManifest({
    invocation: { inputPath: fileName, outputPath: fileName, options: { mode: 'plan' } },
    templates: [{ inputPath: fileName, outputPath: fileName }],
  });
  const analyzed = await new AnalyzeProjectStage({ read: () => Promise.resolve(source) }).run(manifest);
  const session = target === 'tailwind' ? new TailwindRenderSession() : new CssRenderSession();
  const rendered = await new RenderProjectStage(session).run(analyzed);
  const file = rendered.files[0];
  if (file === undefined) throw new Error('The production oracle did not render its template.');
  const edited = new SourceEditor().apply(source, file.edits);
  if (edited.status === 'invalid') throw new Error('The production oracle produced an invalid edit plan.');

  return {
    html: edited.output,
    css: rendered.session.target === 'css' ? serializeOwnedCssBlock(rendered.session.rules, '\n') : undefined,
    results: file.results,
  };
}

function expectDeepFrozen(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const item of Object.values(value)) expectDeepFrozen(item);
}
