export type CompatibilityStatus = 'limited' | 'preserved' | 'planned' | 'not-applicable';

export type DocumentationEvidencePath = string;

export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) deepFreeze(item);
  return Object.freeze(value);
}
