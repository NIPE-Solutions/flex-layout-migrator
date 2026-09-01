import type { LocatedFlexLayoutInput } from '../../../analyzer/flex-layout-attribute.analyzer';
import { BreakpointCatalog } from '../../../breakpoint/breakpoint-catalog';
import { parseLiteralStyleDeclarations } from '../visibility/literal-style-display';
import type { LiteralStyleDeclaration, ResponsiveStyleValueResult } from './responsive-style.model';
import { TailwindArbitraryPropertyEncoder } from './tailwind-arbitrary-property.encoder';
import { cssPropertiesOverlap } from './css-property-ownership';

const interpolation = /\{\{[\s\S]*\}\}/u;
const ordinaryProperty = /^-?[a-z][a-z\d-]*$/iu;
const customProperty = /^--[a-z\d_-]+$/iu;
const unitSuffixes = new Set(['px', '%', 'em', 'rem', 'vw', 'vh', 'vmin', 'vmax', 'deg', 's', 'ms']);
const unitlessNumber = /^[+-]?(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:e[+-]?\d+)?$/iu;
const sanitizerSensitiveFunction = /(?:^|[^a-z\d_-])(?:url|expression|image|(?:-webkit-)?image-set)\s*\(/iu;
const tailwindBuildFunction = /(?:^|[^a-z\d_-])(?:--alpha|--theme|--spacing|theme)\s*\(/iu;
const urlScheme = /(?:https?|data|blob|file|javascript):/iu;

interface NormalizedProperty {
  readonly property: string;
  readonly unit?: string;
}

function normalizeProperty(property: string): NormalizedProperty | undefined {
  if (property.startsWith('--')) {
    return customProperty.test(property) ? { property } : undefined;
  }

  const normalized = property.toLowerCase();
  const separator = normalized.lastIndexOf('.');
  if (separator < 0) return ordinaryProperty.test(normalized) ? { property: normalized } : undefined;

  const base = normalized.slice(0, separator);
  const unit = normalized.slice(separator + 1);
  if (!ordinaryProperty.test(base) || !unitSuffixes.has(unit)) return undefined;
  return { property: base, unit };
}

function normalizeDeclaration(
  declaration: LiteralStyleDeclaration,
  encoder: TailwindArbitraryPropertyEncoder,
): LiteralStyleDeclaration | undefined {
  const normalized = normalizeProperty(declaration.property);
  if (!normalized || !declaration.value) return undefined;

  if (
    sanitizerSensitiveFunction.test(declaration.value) ||
    tailwindBuildFunction.test(declaration.value) ||
    urlScheme.test(declaration.value)
  ) {
    return undefined;
  }

  const value =
    normalized.unit === undefined
      ? declaration.value
      : unitlessNumber.test(declaration.value)
        ? `${declaration.value}${normalized.unit}`
        : undefined;
  if (value === undefined) return undefined;

  const result = { property: normalized.property, value };
  try {
    encoder.encode(result);
  } catch {
    return undefined;
  }
  return result;
}

export function parseResponsiveStyleValue(input: LocatedFlexLayoutInput): ResponsiveStyleValueResult {
  if (input.binding !== 'literal') {
    return { status: 'unverified', reason: 'Responsive style property bindings may depend on runtime state.' };
  }
  if (input.directive !== 'ngStyle') {
    return { status: 'unverified', reason: 'Deprecated responsive style aliases are not converted.' };
  }
  if (input.breakpoint === undefined || new BreakpointCatalog().classify(input.breakpoint).kind !== 'verified') {
    return { status: 'unverified', reason: 'The responsive style breakpoint is not a verified viewport alias.' };
  }
  if (interpolation.test(input.value)) {
    return { status: 'unverified', reason: 'Responsive style interpolation may depend on runtime state.' };
  }

  const parsed = parseLiteralStyleDeclarations(input.value);
  if (parsed.status === 'unverified') return parsed;

  const declarations: LiteralStyleDeclaration[] = [];
  const valuesByProperty = new Map<string, string>();
  const encoder = new TailwindArbitraryPropertyEncoder();

  for (const declaration of parsed.declarations) {
    const normalized = normalizeDeclaration(declaration, encoder);
    if (!normalized) {
      return {
        status: 'unverified',
        reason: `The declaration for ${JSON.stringify(declaration.property)} cannot be sanitized and encoded exactly.`,
      };
    }

    const previous = valuesByProperty.get(normalized.property);
    if (previous !== undefined) {
      if (previous !== normalized.value) {
        return {
          status: 'unverified',
          reason: `The property ${JSON.stringify(normalized.property)} has conflicting duplicate values.`,
        };
      }
      continue;
    }

    const overlapping = declarations.find(declaration =>
      cssPropertiesOverlap(declaration.property, normalized.property),
    );
    if (overlapping !== undefined) {
      return {
        status: 'unverified',
        reason: `The properties ${JSON.stringify(overlapping.property)} and ${JSON.stringify(normalized.property)} have overlapping CSS property ownership.`,
      };
    }

    valuesByProperty.set(normalized.property, normalized.value);
    declarations.push(normalized);
  }

  return { status: 'parsed', value: { declarations } };
}
