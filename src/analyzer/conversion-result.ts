import type { FlexLayoutInput } from './flex-layout-attribute.analyzer';
import type { SourceRange } from '../template/template.model';

export type ConversionStatus = 'converted' | 'review' | 'unsupported' | 'invalid' | 'parse-error';

export type DiagnosticCode =
  | 'bound-class'
  | 'class-conflict'
  | 'breakpoint-unverified'
  | 'custom-breakpoint'
  | 'dynamic-binding'
  | 'display-restoration-unverified'
  | 'invalid-value'
  | 'context-unverified'
  | 'responsive-precedence-unverified'
  | 'semantic-unsupported'
  | 'target-unsupported';

export interface ConvertedResult {
  readonly status: 'converted';
  readonly input: FlexLayoutInput;
}

export interface UnresolvedResult {
  readonly status: 'review' | 'unsupported' | 'invalid';
  readonly input: FlexLayoutInput;
  readonly code: DiagnosticCode;
  readonly reason: string;
  readonly suggestion: string;
}

export interface ParseErrorResult {
  readonly status: 'parse-error';
  readonly fileName: string;
  readonly code: 'template-parse-error';
  readonly reason: string;
  readonly source: SourceRange;
}

export type ConversionResult = ConvertedResult | UnresolvedResult | ParseErrorResult;
