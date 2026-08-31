import {
  parseTemplate,
  TmplAstBoundAttribute,
  TmplAstElement,
  TmplAstRecursiveVisitor,
  TmplAstTextAttribute,
  tmplAstVisitAll,
} from '@angular/compiler';
import { SourceRange, TemplateAttribute, TemplateElement, TemplateParseResult } from './template.model';

function range(start: number, end: number): SourceRange {
  return { start, end };
}

function attributeNameRange(source: string, attribute: TmplAstTextAttribute | TmplAstBoundAttribute): SourceRange {
  const start = attribute.sourceSpan.start.offset;
  const rawAttribute = source.slice(start, attribute.sourceSpan.end.offset);
  const equalsIndex = rawAttribute.indexOf('=');
  const rawName = (equalsIndex === -1 ? rawAttribute : rawAttribute.slice(0, equalsIndex)).trimEnd();
  return range(start, start + rawName.length);
}

function normalizeAttribute(
  source: string,
  attribute: TmplAstTextAttribute | TmplAstBoundAttribute,
  binding: TemplateAttribute['binding'],
): TemplateAttribute {
  const valueSource = attribute.valueSpan
    ? range(attribute.valueSpan.start.offset, attribute.valueSpan.end.offset)
    : undefined;

  return {
    name: attribute.name,
    value: valueSource
      ? source.slice(valueSource.start, valueSource.end)
      : attribute instanceof TmplAstTextAttribute
        ? attribute.value
        : '',
    binding,
    source: range(attribute.sourceSpan.start.offset, attribute.sourceSpan.end.offset),
    nameSource: attributeNameRange(source, attribute),
    ...(valueSource ? { valueSource } : {}),
  };
}

class ElementCollector extends TmplAstRecursiveVisitor {
  readonly elements: TemplateElement[] = [];
  private readonly parents: string[] = [];

  constructor(private readonly source: string) {
    super();
  }

  override visitElement(element: TmplAstElement): void {
    const id = String(element.sourceSpan.start.offset);
    const attributes = [
      ...element.attributes.map(attribute => normalizeAttribute(this.source, attribute, 'literal')),
      ...element.inputs.map(attribute => normalizeAttribute(this.source, attribute, 'property')),
    ].sort((left, right) => left.source.start - right.source.start);

    this.elements.push({
      id,
      name: element.name,
      startTag: range(element.startSourceSpan.start.offset, element.startSourceSpan.end.offset),
      attributes,
      ...(this.parents.at(-1) ? { parentId: this.parents.at(-1) } : {}),
    });

    this.parents.push(id);
    super.visitElement(element);
    this.parents.pop();
  }
}

export class AngularTemplateParser {
  parse(source: string, fileName: string): TemplateParseResult {
    const parsed = parseTemplate(source, fileName, {
      enableBlockSyntax: true,
      preserveLineEndings: true,
      preserveWhitespaces: true,
    });

    if (parsed.errors?.length) {
      return {
        status: 'parse-error',
        diagnostics: parsed.errors.map(error => ({
          message: error.msg,
          source: range(error.span.start.offset, error.span.end.offset),
        })),
      };
    }

    const collector = new ElementCollector(source);
    tmplAstVisitAll(collector, parsed.nodes);
    return { status: 'parsed', elements: collector.elements };
  }
}
