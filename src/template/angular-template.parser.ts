import {
  BindingType,
  parseTemplate,
  TmplAstBoundAttribute,
  TmplAstElement,
  TmplAstRecursiveVisitor,
  TmplAstTemplate,
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
  const nameSource = attributeNameRange(source, attribute);
  const valueSource = attribute.valueSpan
    ? range(attribute.valueSpan.start.offset, attribute.valueSpan.end.offset)
    : undefined;
  const rawValue = valueSource ? source.slice(valueSource.start, valueSource.end) : '';

  return {
    name: attribute.name,
    rawName: source.slice(nameSource.start, nameSource.end),
    rawValue,
    value: attribute instanceof TmplAstTextAttribute ? attribute.value : rawValue,
    binding,
    ...(attribute instanceof TmplAstBoundAttribute ? { bindingTarget: boundTarget(attribute.type) } : {}),
    source: range(attribute.sourceSpan.start.offset, attribute.sourceSpan.end.offset),
    nameSource,
    ...(valueSource ? { valueSource } : {}),
  };
}

function boundTarget(type: BindingType): NonNullable<TemplateAttribute['bindingTarget']> {
  switch (type) {
    case BindingType.Attribute:
      return 'attribute';
    case BindingType.Class:
      return 'class';
    case BindingType.Style:
      return 'style';
    case BindingType.LegacyAnimation:
    case BindingType.Animation:
      return 'animation';
    case BindingType.TwoWay:
      return 'two-way';
    case BindingType.Property:
    default:
      return 'property';
  }
}

class ElementCollector extends TmplAstRecursiveVisitor {
  readonly elements: TemplateElement[] = [];
  private readonly parents: string[] = [];
  private readonly structuralElements = new Set<number>();

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
      source: range(element.sourceSpan.start.offset, element.sourceSpan.end.offset),
      startTag: range(element.startSourceSpan.start.offset, element.startSourceSpan.end.offset),
      ...(element.endSourceSpan && element.endSourceSpan.start.offset !== element.startSourceSpan.start.offset
        ? { endTag: range(element.endSourceSpan.start.offset, element.endSourceSpan.end.offset) }
        : {}),
      structural: this.structuralElements.has(element.sourceSpan.start.offset),
      attributes,
      ...(this.parents.at(-1) ? { parentId: this.parents.at(-1) } : {}),
    });

    this.parents.push(id);
    super.visitElement(element);
    this.parents.pop();
  }

  override visitTemplate(template: TmplAstTemplate): void {
    const structuralElement =
      template.tagName === null
        ? undefined
        : template.children.find(
            child =>
              child instanceof TmplAstElement &&
              child.name === template.tagName &&
              child.sourceSpan.start.offset === template.sourceSpan.start.offset &&
              child.sourceSpan.end.offset === template.sourceSpan.end.offset,
          );

    if (structuralElement) {
      this.structuralElements.add(structuralElement.sourceSpan.start.offset);
    }
    super.visitTemplate(template);
    if (structuralElement) {
      this.structuralElements.delete(structuralElement.sourceSpan.start.offset);
    }
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
