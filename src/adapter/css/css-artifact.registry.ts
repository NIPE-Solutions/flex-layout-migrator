import { createHash } from 'node:crypto';

import type { MediaDefinition } from '../../breakpoint/breakpoint-catalog';
import { CssInvariantError } from './css-invariant.error';
import type { CssDeclaration, CssDigest, CssRuleContext, CssSemanticFamily, OwnedCssRule } from './css-artifact.model';
import { compareOwnedCssRules } from './css-rule-order';

const SHA_256_DIGEST = /^[a-f0-9]{64}$/;

function sha256(canonicalIdentity: string): string {
  return createHash('sha256').update(canonicalIdentity, 'utf8').digest('hex');
}

function freezeDeclarations(declarations: readonly CssDeclaration[]): readonly CssDeclaration[] {
  const properties = new Set<string>();

  for (const declaration of declarations) {
    if (properties.has(declaration.property)) {
      throw new CssInvariantError(`Duplicate CSS declaration property: ${declaration.property}`);
    }
    properties.add(declaration.property);
  }

  return Object.freeze(declarations.map(declaration => Object.freeze({ ...declaration })));
}

function assertFiniteMediaBounds(media: MediaDefinition): void {
  for (const clause of media.clauses) {
    for (const bound of [clause.min, clause.max]) {
      if (bound !== undefined && !Number.isFinite(bound)) {
        throw new CssInvariantError('CSS media bounds must be finite numbers');
      }
    }

    if (clause.min !== undefined && clause.max !== undefined && clause.min > clause.max) {
      throw new CssInvariantError('CSS media minimum bound must not exceed its maximum bound');
    }
  }
}

function freezeMedia(media: MediaDefinition): MediaDefinition {
  assertFiniteMediaBounds(media);
  return Object.freeze({
    type: media.type,
    clauses: Object.freeze(media.clauses.map(clause => Object.freeze({ ...clause }))),
  });
}

function freezeContext(context: CssRuleContext): CssRuleContext {
  if (!Number.isFinite(context.priority)) {
    throw new CssInvariantError('CSS rule priority must be a finite number');
  }

  if (context.media === undefined) {
    if (context.priority !== 0) {
      throw new CssInvariantError('CSS base rules must have priority 0');
    }
    return Object.freeze({ priority: context.priority });
  }

  return Object.freeze({ priority: context.priority, media: freezeMedia(context.media) });
}

function canonicalIdentity(
  family: CssSemanticFamily,
  declarations: readonly CssDeclaration[],
  context: CssRuleContext,
): string {
  return JSON.stringify({
    schema: 1,
    family,
    declarations: declarations.map(({ property, value }) => [property, value]),
    media: context.media
      ? {
          type: context.media.type,
          clauses: context.media.clauses.map(({ min, max, orientation }) => [
            min ?? null,
            max ?? null,
            orientation ?? null,
          ]),
        }
      : null,
    priority: context.priority,
  });
}

export class CssArtifactRegistry {
  private readonly rulesByCanonicalIdentity = new Map<string, OwnedCssRule>();
  private readonly canonicalIdentityByDigest = new Map<string, string>();
  private readonly registeredRules: OwnedCssRule[] = [];

  constructor(private readonly digest: CssDigest = sha256) {}

  register(
    family: CssSemanticFamily,
    declarations: readonly CssDeclaration[],
    context: CssRuleContext = { priority: 0 },
  ): OwnedCssRule {
    const frozenDeclarations = freezeDeclarations(declarations);
    const frozenContext = freezeContext(context);
    const identity = canonicalIdentity(family, frozenDeclarations, frozenContext);
    const existingRule = this.rulesByCanonicalIdentity.get(identity);

    if (existingRule) return existingRule;

    const id = this.digest(identity);
    if (!SHA_256_DIGEST.test(id)) {
      throw new CssInvariantError('CSS artifact digest must be a 64-character lowercase hexadecimal SHA-256 value');
    }

    const collidingIdentity = this.canonicalIdentityByDigest.get(id);
    if (collidingIdentity !== undefined && collidingIdentity !== identity) {
      throw new CssInvariantError('Distinct CSS artifact identities must not share a digest');
    }

    const rule: OwnedCssRule = Object.freeze({
      owner: 'flex-layout-codemod',
      id,
      className: `flm-${id}`,
      family,
      declarations: frozenDeclarations,
      context: frozenContext,
    });

    this.rulesByCanonicalIdentity.set(identity, rule);
    this.canonicalIdentityByDigest.set(id, identity);
    this.registeredRules.push(rule);
    return rule;
  }

  rules(): readonly OwnedCssRule[] {
    return Object.freeze([...this.registeredRules].sort(compareOwnedCssRules));
  }
}
