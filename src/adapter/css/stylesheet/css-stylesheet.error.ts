export type CssStylesheetErrorCode =
  | 'invalid-artifact'
  | 'invalid-css-lexeme'
  | 'unterminated-css-token'
  | 'unknown-ownership-marker'
  | 'unsupported-ownership-schema'
  | 'malformed-ownership-block'
  | 'ownership-rule-mismatch';

export class CssStylesheetError extends Error {
  constructor(
    readonly code: CssStylesheetErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CssStylesheetError';
  }
}
