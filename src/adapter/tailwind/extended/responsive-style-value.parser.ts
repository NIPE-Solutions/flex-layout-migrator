import type { LocatedFlexLayoutInput } from '../../../analyzer/flex-layout-attribute.analyzer';
import { BreakpointCatalog } from '../../../breakpoint/breakpoint-catalog';
import type { LiteralStyleDeclaration, ResponsiveStyleValueResult } from './responsive-style.model';
import { TailwindArbitraryPropertyEncoder } from './tailwind-arbitrary-property.encoder';
import { cssPropertiesOverlap } from './css-property-ownership';
import { analyzeTailwindArbitrarySyntax } from '../tailwind-arbitrary-syntax';

const interpolation = /\{\{[\s\S]*\}\}/u;
const dashedOrdinaryProperty = /^-?[a-z][a-z\d-]*$/iu;
const rendererProperty = /^[a-z][a-z\d]*$/u;
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

  const parts = property.split('.');
  if (parts.length > 2) return undefined;
  const sourceName = parts[0] ?? '';
  const name = sourceName.includes('-')
    ? dashedOrdinaryProperty.test(sourceName)
      ? sourceName.toLowerCase()
      : undefined
    : rendererProperty.test(sourceName)
      ? sourceName
      : undefined;
  if (name === undefined) return undefined;

  const unit = parts[1];
  if (unit === undefined) return { property: name };
  const normalizedUnit = unit.toLowerCase();
  return unitSuffixes.has(normalizedUnit) ? { property: name, unit: normalizedUnit } : undefined;
}

function transformUpstreamRawList(value: string): ResponsiveStyleValueResult {
  const rawDeclarations = String(value)
    .trim()
    .split(';')
    .map(item => item.trim())
    .filter(item => item !== '');
  const declarationsByExactProperty = new Map<string, LiteralStyleDeclaration>();

  for (const rawDeclaration of rawDeclarations) {
    const [rawKey, ...rawValues] = rawDeclaration.split(':');
    if (rawValues.length === 0) {
      return {
        status: 'unverified',
        reason: 'Upstream semicolon splitting produced a style entry without a property separator.',
      };
    }

    const property = (rawKey ?? '').replace(/['"]/gu, '').trim();
    const transformedValue = rawValues.join(':').replace(/['"]/gu, '').trim().replace(/;/u, '');
    if (!property || !transformedValue) {
      return {
        status: 'unverified',
        reason: 'Upstream raw-string transformation produced an empty style key or value.',
      };
    }
    // Flex-Layout reduces its raw string into a plain object first. Updating an
    // exact key keeps that key's original insertion position, while a
    // differently-cased key is applied later as a distinct renderer entry.
    declarationsByExactProperty.set(property, { property, value: transformedValue });
  }

  return { status: 'parsed', value: { declarations: [...declarationsByExactProperty.values()] } };
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
    const candidate = encoder.encode(result);
    const arbitrary = analyzeTailwindArbitrarySyntax(candidate);
    if (arbitrary === undefined || arbitrary.important) return undefined;
  } catch {
    return undefined;
  }
  return result;
}

export function parseLiteralResponsiveStyleValue(value: string): ResponsiveStyleValueResult {
  const transformed = transformUpstreamRawList(value);
  if (transformed.status === 'unverified') return transformed;

  const declarationsByProperty = new Map<string, LiteralStyleDeclaration>();
  const encoder = new TailwindArbitraryPropertyEncoder();

  for (const declaration of transformed.value.declarations) {
    const normalized = normalizeDeclaration(declaration, encoder);
    if (!normalized) {
      const importantCandidate = (() => {
        try {
          return analyzeTailwindArbitrarySyntax(encoder.encode(declaration))?.important === true;
        } catch {
          return false;
        }
      })();
      return {
        status: 'unverified',
        reason: importantCandidate
          ? `The declaration for ${JSON.stringify(declaration.property)} contains priority text that Angular NgStyle does not apply.`
          : `The declaration for ${JSON.stringify(declaration.property)} cannot be sanitized and encoded exactly.`,
      };
    }
    declarationsByProperty.set(normalized.property, normalized);
  }

  const declarations = [...declarationsByProperty.values()];
  for (const [index, declaration] of declarations.entries()) {
    const overlapping = declarations
      .slice(index + 1)
      .find(candidate => cssPropertiesOverlap(declaration.property, candidate.property));
    if (overlapping !== undefined) {
      return {
        status: 'unverified',
        reason: `The properties ${JSON.stringify(declaration.property)} and ${JSON.stringify(overlapping.property)} have overlapping CSS property ownership.`,
      };
    }
  }

  return { status: 'parsed', value: { declarations } };
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

  return parseLiteralResponsiveStyleValue(input.value);
}
