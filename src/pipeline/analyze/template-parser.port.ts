import type { TemplateParseResult } from '../../template/template.model';

export interface TemplateParser {
  parse(source: string, fileName: string): TemplateParseResult;
}
