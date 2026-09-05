import type { ConversionResult, DiagnosticCode } from '../analyzer/conversion-result';
import { TemplateAnalyzer } from '../analyzer/template.analyzer';
import { SourceEditor } from '../edit/source-editor';
import type { EditDiagnostic } from '../edit/source-edit';
import { mergeStylesheetContents } from '../migrator/stylesheet-contents';
import { ConversionPlanner } from '../planner/conversion-planner';
import { createRenderSession } from '../render/render-session';
import { AngularTemplateParser } from '../template/angular-template.parser';
import type { SourceRange } from '../template/template.model';

export interface TemplatePreviewInput {
  readonly source: string;
  readonly target: 'tailwind' | 'css';
  readonly fileName?: string;
}

export type TemplatePreviewDiagnostic =
  | {
      readonly code: DiagnosticCode;
      readonly message: string;
      readonly suggestion: string;
      readonly source: SourceRange;
    }
  | {
      readonly code: 'template-parse-error';
      readonly message: string;
      readonly source: SourceRange;
    }
  | EditDiagnostic;

export interface TemplatePreviewResult {
  readonly html: string;
  readonly css: string | undefined;
  readonly results: readonly ConversionResult[];
  readonly diagnostics: readonly TemplatePreviewDiagnostic[];
}

export function previewTemplate(input: TemplatePreviewInput): TemplatePreviewResult {
  const fileName = input.fileName ?? 'template.html';
  const parsed = new AngularTemplateParser().parse(input.source, fileName);
  if (parsed.status === 'parse-error') {
    const results = parsed.diagnostics.map(diagnostic => ({
      status: 'parse-error',
      fileName,
      code: 'template-parse-error',
      reason: diagnostic.message,
      source: diagnostic.source,
    })) satisfies readonly ConversionResult[];
    return freezeValue({
      html: input.source,
      css: input.target === 'css' ? '' : undefined,
      results,
      diagnostics: results.map(result => {
        if (result.status !== 'parse-error') throw new Error('Expected a template parse error.');
        return { code: result.code, message: result.reason, source: result.source };
      }),
    });
  }

  const inputs = new TemplateAnalyzer().analyze(fileName, parsed.elements);
  const session = createRenderSession(input.target);
  const plan = new ConversionPlanner().plan(input.source, parsed.elements, inputs, session.renderer);
  const edited = new SourceEditor().apply(input.source, plan.edits);
  const finalized = session.finalize();
  const diagnostics: TemplatePreviewDiagnostic[] = plan.results.flatMap(result => {
    if (result.status === 'converted' || result.status === 'parse-error') return [];
    const locatedInput = inputs.find(input => input === result.input);
    if (locatedInput === undefined) throw new Error('Conversion result lost its analyzed input identity.');
    return [
      {
        code: result.code,
        message: result.reason,
        suggestion: result.suggestion,
        source: locatedInput.source,
      },
    ];
  });

  if (edited.status === 'invalid') {
    diagnostics.push(...edited.diagnostics);
    return freezeValue({
      html: input.source,
      css: input.target === 'css' ? '' : undefined,
      results: plan.results,
      diagnostics,
    });
  }

  const css = finalized.target === 'css' ? mergeStylesheetContents('', finalized.rules).output : undefined;
  return freezeValue({ html: edited.output, css, results: plan.results, diagnostics });
}

function freezeValue<T>(value: T): T {
  if (Array.isArray(value)) return Object.freeze(value.map(item => freezeValue(item))) as T;
  if (value !== null && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freezeValue(item)]))) as T;
  }
  return value;
}
