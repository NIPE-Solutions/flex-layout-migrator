import { describe, expect, it, vi } from 'vitest';
import { analyzeTailwindStylesheet, resolveTailwindTargetProfile } from '../config/tailwind-target-profile';
import { previewTemplate } from './template-preview';
import { SourceEditor } from '../edit/source-editor';

describe('target-aware preview', () => {
  const targetProfile = resolveTailwindTargetProfile({ explicit: { prefix: 'tw' } });
  it('prefixes all generated tokens including exact responsive ranges', () => {
    const result = previewTemplate({
      source: '<div fxLayout="row" fxLayout.md="column" fxLayoutGap="13px"></div>',
      target: 'tailwind',
      targetProfile,
    });
    expect(result.html).toContain('tw:flex');
    expect(result.html).toContain('tw:[@media_screen_and_');
    expect(result.html).not.toContain('tw:md:');
    expect(result.targetProfile?.fingerprint).toBe(targetProfile.fingerprint);
  });
  it.each(['tw:flex-col', 'tw:md:flex-col'])('preserves a directive conflicting with %s', token => {
    const source = `<div fxLayout="row" class="${token}"></div>`;
    const result = previewTemplate({ source, target: 'tailwind', targetProfile });
    expect(result.html).toBe(source);
    expect(result.diagnostics.some(item => item.code === 'class-conflict')).toBe(true);
  });
  it('accepts identical prefixed utilities without changing existing tokens', () => {
    const result = previewTemplate({
      source: '<div fxLayout="row" class="tw:flex tw:flex-row"></div>',
      target: 'tailwind',
      targetProfile,
    });
    expect(result.html).not.toContain('fxLayout');
    expect(result.html).not.toContain('tw:tw:');
  });
  it('rejects generated invalid Angular instead of showing a successful proposal', () => {
    const source = '<div fxLayout="row"></div>';
    const spy = vi
      .spyOn(SourceEditor.prototype, 'apply')
      .mockReturnValue({ status: 'applied', output: '<div><span></div>' });
    try {
      const result = previewTemplate({ source, target: 'tailwind' });
      expect(result.html).toBe(source);
      expect(result.state).toBe('rejected');
      expect(result.results.every(item => item.status === 'parse-error')).toBe(true);
      expect(result.diagnostics[0]?.code).toBe('generated-template-parse-error');
    } finally {
      spy.mockRestore();
    }
  });
});

it.each([
  '@import "tailwindcss/theme.css";',
  '@import "tailwindcss/preflight.css";',
  '@import "tailwindcss"; @plugin "./override-flex.js";',
])('preserves source when target utilities cannot be proven: %s', css => {
  const targetProfile = resolveTailwindTargetProfile({ detected: analyzeTailwindStylesheet(css) });
  const source = '<div fxLayout="row"></div>';
  const result = previewTemplate({ source, target: 'tailwind', targetProfile });
  expect(result.html).toBe(source);
  expect(result.state).toBe('review-required');
});

it('does not let a prefix override alone hide unknown executable configuration', () => {
  const targetProfile = resolveTailwindTargetProfile({
    detected: analyzeTailwindStylesheet('@import "tailwindcss"; @config "./legacy.js";'),
    explicit: { prefix: 'tw' },
  });
  const source = '<div fxLayout="row"></div>';
  expect(previewTemplate({ source, target: 'tailwind', targetProfile }).html).toBe(source);
});

it('does not treat existing built-in orientation variants as disjoint width breakpoints', () => {
  const targetProfile = resolveTailwindTargetProfile({ explicit: { breakpoints: { '*': null, portrait: '960px' } } });
  const source = '<div class="[@media_screen]:portrait:flex-col" fxLayout.lt-sm="row"></div>';
  const result = previewTemplate({ source, target: 'tailwind', targetProfile });
  expect(result.html).toBe(source);
  expect(result.state).toBe('review-required');
});
