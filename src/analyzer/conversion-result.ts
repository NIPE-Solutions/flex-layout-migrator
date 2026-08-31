import type { FlexLayoutInput } from './flex-layout-attribute.analyzer';

export type ConversionStatus = 'converted' | 'review' | 'unsupported' | 'invalid';

export type DiagnosticCode = 'breakpoint-unverified' | 'dynamic-binding' | 'target-unsupported' | 'unknown-breakpoint';

export interface ConversionResult {
  status: ConversionStatus;
  input: FlexLayoutInput;
  code?: DiagnosticCode;
  reason?: string;
  suggestion?: string;
}
