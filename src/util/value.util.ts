function isArbitraryValue(value: string): boolean {
  return !!value.match(/^[0-9]+(\.[0-9]+)?(px|em|rem|%|vw|vh|vmin|vmax)$/);
}

export { isArbitraryValue };
