// @vitest-environment node

import { readFile } from 'node:fs/promises';

import { parse } from 'postcss';
import { describe, expect, it } from 'vitest';

const adjacentLightSurfaces = ['--surface-canvas', '--surface-raised', '--surface-quiet'] as const;

function readLightTokens(css: string): ReadonlyMap<string, string> {
  const stylesheet = parse(css);
  const rootRule = stylesheet.nodes.find(node => node.type === 'rule' && node.selector === ':root');

  if (rootRule === undefined || rootRule.type !== 'rule') {
    throw new Error('The light-theme :root token rule is missing.');
  }

  const tokens = new Map<string, string>();
  rootRule.walkDecls(declaration => {
    tokens.set(declaration.prop, declaration.value);
  });
  return tokens;
}

function resolveToken(tokens: ReadonlyMap<string, string>, tokenName: string): string {
  const visited = new Set<string>();
  let currentName = tokenName;

  while (!visited.has(currentName)) {
    visited.add(currentName);
    const value = tokens.get(currentName);

    if (value === undefined) {
      throw new Error(`Token ${currentName} is missing.`);
    }

    const reference = /^var\((--[\w-]+)\)$/.exec(value);
    if (reference === null) {
      return value;
    }

    currentName = reference[1] as string;
  }

  throw new Error(`Token ${tokenName} contains a circular reference.`);
}

function relativeLuminance(hex: string): number {
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex);
  if (match === null) {
    throw new Error(`Expected a six-digit hex color, received ${hex}.`);
  }

  const channels = match.slice(1).map(channel => Number.parseInt(channel, 16) / 255);
  return channels
    .map(channel => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index]!, 0);
}

function contrastRatio(first: string, second: string): number {
  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second));
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

function readDeclarations(css: string, selector: string): ReadonlyMap<string, string> {
  const stylesheet = parse(css);
  const rule = stylesheet.nodes.find(node => node.type === 'rule' && node.selector?.split(',').includes(selector));
  if (rule === undefined || rule.type !== 'rule') throw new Error(`Missing rule for ${selector}.`);

  const declarations = new Map<string, string>();
  rule.walkDecls(declaration => void declarations.set(declaration.prop, declaration.value));
  return declarations;
}

function resolveCssValue(tokens: ReadonlyMap<string, string>, value: string): string {
  const reference = /^var\((--[\w-]+)\)$/u.exec(value);
  return reference === null ? value : resolveToken(tokens, reference[1] as string);
}

describe('light theme focus tokens', () => {
  it('keeps the global focus indicator at 3:1 against every adjacent light surface', async () => {
    const tokensCss = await readFile(new URL('./tokens.css', import.meta.url), 'utf8');
    const tokens = readLightTokens(tokensCss);
    const focusRing = resolveToken(tokens, '--focus-ring');

    for (const surfaceName of adjacentLightSurfaces) {
      const surface = resolveToken(tokens, surfaceName);
      expect(
        contrastRatio(focusRing, surface),
        `${focusRing} against ${surfaceName} (${surface})`,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it('keeps primary action hover text readable against its output signal', async () => {
    const [tokensCss, globalCss] = await Promise.all([
      readFile(new URL('./tokens.css', import.meta.url), 'utf8'),
      readFile(new URL('./global.css', import.meta.url), 'utf8'),
    ]);
    const tokens = readLightTokens(tokensCss);
    const declarations = readDeclarations(globalCss, '.action-button--primary:hover');
    const foreground = resolveCssValue(tokens, declarations.get('color') ?? '');
    const background = resolveCssValue(tokens, declarations.get('background') ?? '');

    expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });
});
