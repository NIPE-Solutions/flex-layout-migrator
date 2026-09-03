export interface SourceRange {
  readonly start: number;
  readonly end: number;
}

export interface TemplateAttribute {
  readonly name: string;
  readonly rawName: string;
  readonly rawValue: string;
  readonly value: string;
  readonly binding: 'literal' | 'property';
  readonly bindingTarget?: 'property' | 'attribute' | 'class' | 'style' | 'animation' | 'two-way';
  readonly source: SourceRange;
  readonly nameSource: SourceRange;
  readonly valueSource?: SourceRange;
}

export interface TemplateElement {
  readonly id: string;
  readonly name: string;
  readonly source: SourceRange;
  readonly startTag: SourceRange;
  readonly endTag?: SourceRange;
  readonly structural: boolean;
  readonly attributes: readonly TemplateAttribute[];
  readonly parentId?: string;
}

export interface ParseDiagnostic {
  readonly message: string;
  readonly source: SourceRange;
}

export type TemplateParseResult =
  | { readonly status: 'parsed'; readonly elements: readonly TemplateElement[] }
  | { readonly status: 'parse-error'; readonly diagnostics: readonly ParseDiagnostic[] };
