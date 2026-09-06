import type { ConversionResult } from '../analyzer/conversion-result';
import type { TemplateParser } from '../pipeline/analyze/template-parser.port';
import { AngularTemplateParser } from './angular-template.parser';

/** Browser and CLI share the same generated Angular acceptance boundary. */
export function generatedTemplateErrors(
  source: string,
  fileName: string,
  parser: TemplateParser = new AngularTemplateParser(),
): readonly ConversionResult[] {
  const parsed = parser.parse(source, fileName);
  return parsed.status === 'parse-error'
    ? parsed.diagnostics.map(diagnostic => ({
        status: 'parse-error',
        fileName,
        code: 'generated-template-parse-error',
        reason: diagnostic.message,
        source: diagnostic.source,
      }))
    : [];
}
