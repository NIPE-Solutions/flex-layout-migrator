import type { LiteralStyleDeclaration } from '../visibility/literal-style-display';

const ordinaryProperty = /^-?[a-z][a-z\d-]*$/iu;
const customProperty = /^--[a-z\d_-]+$/iu;

function containsControl(value: string): boolean {
  return [...value].some(character => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint < 0x20 || codePoint === 0x7f);
  });
}

function isEncodable(declaration: LiteralStyleDeclaration): boolean {
  const propertyIsValid = ordinaryProperty.test(declaration.property) || customProperty.test(declaration.property);
  return (
    propertyIsValid &&
    declaration.value.length > 0 &&
    !containsControl(declaration.value) &&
    !/[\\[\]{}]/u.test(declaration.value)
  );
}

export class TailwindArbitraryPropertyEncoder {
  encode(declaration: LiteralStyleDeclaration): string {
    if (!isEncodable(declaration)) {
      throw new Error('The style declaration cannot be encoded as an exact Tailwind arbitrary property.');
    }

    const value = declaration.value.replaceAll('_', '\\_').replaceAll(' ', '_');
    return `[${declaration.property}:${value}]`;
  }
}
