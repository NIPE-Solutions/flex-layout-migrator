export type SrcsetValueValidation =
  { readonly status: 'valid'; readonly value: string } | { readonly status: 'invalid'; readonly reason: string };

export function validateSingleSrcsetUrl(value: string): SrcsetValueValidation {
  if (value.length === 0) {
    return { status: 'invalid', reason: 'A responsive image source cannot be empty.' };
  }
  if (value.includes('{{') || value.includes('}}')) {
    return { status: 'invalid', reason: 'Interpolation is not a literal responsive image URL.' };
  }
  if ([...value].some(character => character === ',' || character.charCodeAt(0) <= 32 || character === '\u007f')) {
    return {
      status: 'invalid',
      reason: 'The value is not one descriptor-free srcset URL.',
    };
  }
  return { status: 'valid', value };
}
