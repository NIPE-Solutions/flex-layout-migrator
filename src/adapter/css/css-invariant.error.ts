export class CssInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CssInvariantError';
  }
}
