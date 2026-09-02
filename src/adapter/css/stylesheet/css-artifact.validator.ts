import type { CssSemanticFamily, OwnedCssRule } from '../css-artifact.model';
import { CssStylesheetError } from './css-stylesheet.error';

const ID = /^(?:[a-f0-9]{64})$(?![\s\S])/;
const PROPERTY = /^(?:-?[a-z][a-z0-9-]*)$(?![\s\S])/;
const FORBIDDEN_VALUE = /[\0\r\n{};]|\/\*|\*\//;
const FAMILIES = new Set<CssSemanticFamily>([
  'layout',
  'layout-align',
  'layout-gap',
  'flex-item',
  'flex-align',
  'flex-fill',
  'flex-offset',
  'flex-order',
]);

type ArtifactRecord = Record<string, unknown>;

function isArtifactRecord(value: unknown): value is ArtifactRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidArtifact(message: string): never {
  throw new CssStylesheetError('invalid-artifact', message);
}

function invalidLexeme(message: string): never {
  throw new CssStylesheetError('invalid-css-lexeme', message);
}

function validateDeclarations(value: unknown): void {
  if (!Array.isArray(value) || value.length === 0) {
    invalidArtifact('CSS declarations must be a nonempty array');
  }

  const properties = new Set<string>();
  for (const declaration of value) {
    if (!isArtifactRecord(declaration)) {
      invalidArtifact('CSS declaration must be an object');
    }

    const { property, value: declarationValue } = declaration;
    if (typeof property !== 'string' || !PROPERTY.test(property)) {
      invalidLexeme('CSS declaration property is unsafe');
    }
    if (properties.has(property)) {
      invalidArtifact('CSS declaration properties must be unique');
    }
    properties.add(property);

    if (
      typeof declarationValue !== 'string' ||
      declarationValue.length === 0 ||
      declarationValue.trim() !== declarationValue ||
      FORBIDDEN_VALUE.test(declarationValue)
    ) {
      invalidLexeme('CSS declaration value is unsafe');
    }
  }
}

function validateMedia(value: unknown): void {
  if (!isArtifactRecord(value)) {
    invalidArtifact('CSS media must be an object');
  }

  const { type, clauses } = value;
  if (type !== 'screen' && type !== 'print') {
    invalidArtifact('CSS media type is invalid');
  }
  if (!Array.isArray(clauses) || clauses.length === 0) {
    invalidArtifact('CSS media must contain at least one clause');
  }

  for (const clause of clauses) {
    if (!isArtifactRecord(clause)) {
      invalidArtifact('CSS media clause must be an object');
    }

    const { min, max, orientation } = clause;
    if (
      (min !== undefined && (typeof min !== 'number' || !Number.isFinite(min))) ||
      (max !== undefined && (typeof max !== 'number' || !Number.isFinite(max)))
    ) {
      invalidArtifact('CSS media bounds must be finite numbers');
    }
    if (min !== undefined && max !== undefined && min > max) {
      invalidArtifact('CSS media minimum must not exceed maximum');
    }
    if (orientation !== undefined && orientation !== 'portrait' && orientation !== 'landscape') {
      invalidArtifact('CSS media orientation is invalid');
    }
    if (type === 'screen' && min === undefined && max === undefined && orientation === undefined) {
      invalidArtifact('CSS screen media clause must contain a feature');
    }
  }
}

function validateContext(value: unknown): void {
  if (!isArtifactRecord(value)) {
    invalidArtifact('CSS rule context must be an object');
  }

  const { priority, media } = value;
  if (typeof priority !== 'number' || !Number.isFinite(priority)) {
    invalidArtifact('CSS rule priority must be a finite number');
  }
  if (media === undefined) {
    if (priority !== 0) {
      invalidArtifact('CSS base rule priority must be zero');
    }
    return;
  }

  validateMedia(media);
}

export function validateOwnedCssRule(rule: OwnedCssRule): void {
  if (!isArtifactRecord(rule)) {
    invalidArtifact('CSS rule must be an object');
  }

  const { owner, id, className, family, declarations, context } = rule;
  if (owner !== 'flex-layout-codemod') {
    invalidArtifact('CSS rule owner is invalid');
  }
  if (typeof id !== 'string' || !ID.test(id)) {
    invalidArtifact('CSS rule ID is invalid');
  }
  if (className !== `flm-${id}`) {
    invalidArtifact('CSS rule class name is invalid');
  }
  if (typeof family !== 'string' || !FAMILIES.has(family as CssSemanticFamily)) {
    invalidArtifact('CSS rule family is invalid');
  }

  validateDeclarations(declarations);
  validateContext(context);
}
