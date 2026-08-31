function baseUtility(className: string): string {
  const arbitraryVariant = className.lastIndexOf(':[');
  if (arbitraryVariant >= 0) return className.slice(arbitraryVariant + 1);
  if (className.startsWith('[')) return className;
  return className.slice(className.lastIndexOf(':') + 1);
}

function propertyGroup(className: string): string | undefined {
  const value = baseUtility(className);
  const arbitraryProperty = value.match(/^\[([^:]+):/u)?.[1];
  if (arbitraryProperty) {
    if (['flex', 'flex-grow', 'flex-shrink', 'flex-basis'].includes(arbitraryProperty)) return 'flex-sizing';
    return arbitraryProperty;
  }
  if (/^(?:flex|inline-flex|grid|inline-grid|block|inline-block|hidden)$/u.test(value)) return 'display';
  if (/^flex-(?:row|row-reverse|col|col-reverse)$/u.test(value)) return 'flex-direction';
  if (/^flex-(?:wrap|wrap-reverse|nowrap)$/u.test(value)) return 'flex-wrap';
  if (/^(?:flex-.+|grow(?:-.+)?|shrink(?:-.+)?|basis-.+)$/u.test(value)) return 'flex-sizing';
  if (/^box-(?:border|content)$/u.test(value)) return 'box-sizing';
  if (/^justify-/u.test(value)) return 'justify-content';
  if (/^items-/u.test(value)) return 'align-items';
  if (/^content-/u.test(value)) return 'align-content';
  if (/^self-/u.test(value)) return 'align-self';
  if (/^(?:gap|gap-x|gap-y)-/u.test(value)) return 'gap';
  if (/^order-/u.test(value)) return 'order';
  if (/^-?m(?:[trblxyse])?-/u.test(value)) return 'margin';
  if (/^(?:size|w)-/u.test(value)) return 'width';
  if (/^(?:size|h)-/u.test(value)) return 'height';
  if (/^min-w-/u.test(value)) return 'min-width';
  if (/^min-h-/u.test(value)) return 'min-height';
  if (/^max-w-/u.test(value)) return 'max-width';
  if (/^max-h-/u.test(value)) return 'max-height';
  return undefined;
}

export function hasTailwindClassConflict(
  existingClassNames: readonly string[],
  generatedClassNames: readonly string[],
): boolean {
  const generated = new Set(generatedClassNames);
  const generatedGroups = new Set(
    generatedClassNames.map(propertyGroup).filter((group): group is string => group !== undefined),
  );
  const conflicts = (className: string) => {
    const group = propertyGroup(className);
    return group !== undefined && generatedGroups.has(group);
  };
  return existingClassNames.some(className => !generated.has(className) && conflicts(className));
}
