export function arbitraryValue(value: string): string {
  return `[${value.replaceAll(/\s+/g, '_')}]`;
}
