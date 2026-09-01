import type { TemplateAttribute } from './template.model';

export function templateAttributeKeys(attribute: TemplateAttribute): ReadonlySet<string> {
  const semanticKey = attribute.name.toLowerCase();
  const rawName = attribute.rawName.toLowerCase();
  const rawKey =
    attribute.binding !== 'property'
      ? rawName
      : rawName.startsWith('[') && rawName.endsWith(']')
        ? rawName.slice(1, -1)
        : rawName.startsWith('bind-')
          ? rawName.slice('bind-'.length)
          : rawName;
  return new Set([rawKey, semanticKey]);
}
