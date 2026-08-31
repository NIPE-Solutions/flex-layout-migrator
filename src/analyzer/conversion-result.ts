import type { FlexLayoutInput } from './flex-layout-attribute.analyzer';

export type ConversionStatus = 'converted' | 'review' | 'unsupported' | 'invalid';

export type DiagnosticCode = 'breakpoint-unverified' | 'custom-breakpoint' | 'dynamic-binding' | 'target-unsupported';

export interface ConversionResult {
  status: ConversionStatus;
  input: FlexLayoutInput;
  code?: DiagnosticCode;
  reason?: string;
  suggestion?: string;
}
