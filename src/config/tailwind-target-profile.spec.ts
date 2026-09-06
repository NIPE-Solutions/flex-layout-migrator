import { describe, expect, it } from 'vitest';
import { analyzeTailwindStylesheet, resolveTailwindTargetProfile } from './tailwind-target-profile';

describe('Tailwind target profile', () => {
  it('resolves defaults and deterministic fingerprints independently of declaration order', () => {
    const a = resolveTailwindTargetProfile();
    expect(a.prefix.value).toBe(null);
    expect(a.breakpoints.md?.value).toBe('48rem');
    expect(a.prefix.confidence).toBe('defaulted');
    expect(resolveTailwindTargetProfile({ explicit: { breakpoints: { a: '1px', b: '2px' } } }).fingerprint).toBe(
      resolveTailwindTargetProfile({ explicit: { breakpoints: { b: '2px', a: '1px' } } }).fingerprint,
    );
  });
  it('resolves stylesheet < profile < CLI and retains conflicting evidence', () => {
    const detected = analyzeTailwindStylesheet('@import "tailwindcss" prefix(acme) important;', 'src/styles.css');
    const profile = resolveTailwindTargetProfile({ detected, explicit: { prefix: 'app' }, cli: { prefix: 'tw' } });
    expect(profile.prefix).toMatchObject({ value: 'tw', source: 'CLI', confidence: 'explicit' });
    expect(profile.important.value).toBe('important');
    expect(profile.diagnostics.some(item => item.code === 'tailwind-prefix-conflict')).toBe(true);
  });
  it('applies namespace reset and individual initial removal in source order', () => {
    const detected = analyzeTailwindStylesheet(`@import "tailwindcss"; @theme {
      --breakpoint-*: initial; --breakpoint-mobile: 30rem; --breakpoint-tablet: 48rem;
      --breakpoint-mobile: initial;
    }`);
    expect(Object.keys(resolveTailwindTargetProfile({ detected }).breakpoints)).toEqual(['tablet']);
  });
  it('supports split imports and records external code without executing it', () => {
    const detected = analyzeTailwindStylesheet(`@import "tailwindcss/theme.css" prefix(tw);
      @import "tailwindcss/utilities.css" prefix(tw) important source(none);
      @config "./evil.js"; @plugin "./evil-plugin.js"; @import url(https://example.com/theme.css);`);
    const profile = resolveTailwindTargetProfile({ detected });
    expect(profile.prefix.value).toBe('tw');
    expect(profile.diagnostics.map(item => item.code)).toEqual(
      expect.arrayContaining([
        'tailwind-config-external',
        'tailwind-plugin-external',
        'tailwind-source-excluded',
        'tailwind-import-unresolved',
      ]),
    );
  });
  it('warns on mixed units and rejects unsafe explicit values', () => {
    expect(resolveTailwindTargetProfile({ explicit: { breakpoints: { phone: '600px' } } }).diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'tailwind-mixed-breakpoint-units' })]),
    );
    for (const prefix of ['tw-', 'TW', 'tw:foo', 'a b']) {
      expect(() => resolveTailwindTargetProfile({ explicit: { prefix } })).toThrow(/prefix/i);
    }
    expect(() => resolveTailwindTargetProfile({ explicit: { breakpoints: { bad: 'var(--x)' } } })).toThrow(
      /breakpoint/i,
    );
  });
  it('does not read comments, strings or nested conditional theme as unconditional settings', () => {
    const detected = analyzeTailwindStylesheet(`/* @import "tailwindcss" prefix(fake); */
      @import "tailwindcss"; .x { content: '--breakpoint-md: 1px'; }
      @media print { @theme { --breakpoint-md: 2px; } }`);
    const profile = resolveTailwindTargetProfile({ detected });
    expect(profile.prefix.value).toBe(null);
    expect(profile.breakpoints.md?.value).toBe('48rem');
    expect(profile.diagnostics.some(item => item.code === 'tailwind-target-unknown')).toBe(true);
  });
});

it('does not interpret quoted source paths as prefix or important modifiers', () => {
  const detected = analyzeTailwindStylesheet('@import "tailwindcss" source("prefix(fake) important");');
  const profile = resolveTailwindTargetProfile({ detected });
  expect(profile.prefix.value).toBe(null);
  expect(profile.important.value).toBe('normal');
});

it('does not invent default breakpoints for utilities-only imports', () => {
  const detected = analyzeTailwindStylesheet(
    '@import "tailwindcss/utilities.css"; @theme { --breakpoint-phone: 600px; }',
  );
  expect(Object.keys(resolveTailwindTargetProfile({ detected }).breakpoints)).toEqual(['phone']);
});

it('records an explicit declaration of standard core utilities without executing legacy configuration', () => {
  const profile = resolveTailwindTargetProfile({
    detected: analyzeTailwindStylesheet('@import "tailwindcss"; @config "./legacy.js";'),
    explicit: { prefix: null, important: 'normal', coreUtilities: 'standard' },
  });
  expect(profile.coreUtilities.confidence).toBe('explicit');
  expect(profile.diagnostics.some(item => item.code === 'tailwind-config-external')).toBe(true);
  expect(profile.assumptions.some(item => item.includes('explicitly asserts'))).toBe(true);
});
