import { sha256 } from '../util/sha-256.js';
import postcss from 'postcss';

export type TargetDiagnosticCode =
  | 'tailwind-prefix-conflict'
  | 'tailwind-config-external'
  | 'tailwind-plugin-external'
  | 'tailwind-breakpoint-unknown'
  | 'tailwind-mixed-breakpoint-units'
  | 'tailwind-target-unknown'
  | 'tailwind-source-excluded'
  | 'tailwind-import-unresolved'
  | 'tailwind-target-assumption';
export interface TargetDiagnostic {
  readonly code: TargetDiagnosticCode;
  readonly message: string;
}
export interface TargetSetting<T> {
  readonly value: T;
  readonly source: string;
  readonly confidence: 'explicit' | 'detected' | 'defaulted' | 'unknown';
}
export interface TailwindTargetOverrides {
  readonly version?: 4;
  readonly prefix?: string | null;
  readonly breakpoints?: Readonly<Record<string, string | null>>;
  readonly important?: 'normal' | 'important';
  readonly coreUtilities?: 'standard';
}
export interface TailwindTargetProfile {
  readonly target: 'tailwind';
  readonly version: 4;
  readonly prefix: TargetSetting<string | null>;
  readonly breakpoints: Readonly<Record<string, TargetSetting<string>>>;
  readonly important: TargetSetting<'normal' | 'important' | 'unknown'>;
  readonly coreUtilities: TargetSetting<'standard' | 'unknown'>;
  readonly diagnostics: readonly TargetDiagnostic[];
  readonly assumptions: readonly string[];
  readonly fingerprint: string;
  readonly stylesheet?: string;
}
export type TargetOperation =
  | { readonly kind: 'prefix'; readonly value: string | null; readonly source: string }
  | { readonly kind: 'important'; readonly value: 'normal' | 'important'; readonly source: string }
  | { readonly kind: 'breakpoint'; readonly name: string; readonly value: string | null; readonly source: string };
export interface StylesheetAnalysis {
  readonly operations: readonly TargetOperation[];
  readonly diagnostics: readonly TargetDiagnostic[];
  readonly imports: readonly string[];
  readonly tailwind: boolean;
  readonly defaultTheme: boolean;
  readonly utilities: boolean;
  readonly source: string;
}
const defaults = { sm: '40rem', md: '48rem', lg: '64rem', xl: '80rem', '2xl': '96rem' };
export function validBreakpoint(value: string): boolean {
  return /^(?:0|[1-9]\d*)(?:\.\d+)?(?:px|rem|em)$/.test(value) && Number.parseFloat(value) < 1e7;
}
export function validPrefix(value: string): boolean {
  return /^[a-z]+$/.test(value);
}

/** Static extraction only. This parser never loads imports, plugins or JS configuration. */
export function analyzeTailwindStylesheet(css: string, source = 'pasted stylesheet'): StylesheetAnalysis {
  const operations: TargetOperation[] = [];
  const diagnostics: TargetDiagnostic[] = [];
  const imports: string[] = [];
  let tailwind = false;
  let defaultTheme = false;
  let utilities = false;
  const warn = (code: TargetDiagnosticCode, message: string) =>
    diagnostics.push({ code, message: `${source}: ${message}` });
  if (css.length > 2_000_000) throw new Error('Stylesheet exceeds the 2 MB static analysis limit.');
  const root = postcss.parse(css, { from: undefined });
  root.walkAtRules(rule => {
    if (rule.name === 'custom-variant' || rule.name === 'utility')
      warn('tailwind-target-unknown', `@${rule.name} may change generated utility semantics and is not evaluated.`);
    if (rule.name === 'config' || rule.name === 'plugin') {
      warn(
        rule.name === 'config' ? 'tailwind-config-external' : 'tailwind-plugin-external',
        `@${rule.name} ${rule.params} was not executed; additional configuration is unknown.`,
      );
    }
    if (rule.name === 'source' && /^not\b/.test(rule.params)) {
      warn('tailwind-source-excluded', `Source exclusion ${rule.params} may exclude migrated templates.`);
    }
    if (rule.name === 'import') {
      const match = /^(["'])([^"']+)\1(.*)$/.exec(rule.params);
      if (!match) {
        warn('tailwind-import-unresolved', `Import ${rule.params} was not loaded.`);
        return;
      }
      const imported = match[2]!;
      const modifiers = match[3]!;
      if (/^tailwindcss(?:\/(?:theme|utilities|preflight)\.css)?$/.test(imported)) {
        tailwind = true;
        if (rule.parent?.type !== 'root') {
          warn('tailwind-target-unknown', 'Conditional Tailwind import is unresolved.');
          return;
        }
        let remaining = modifiers.trim();
        let prefix: string | null = null;
        let important = false;
        const seen = new Set<string>();
        while (remaining) {
          const modifier =
            /^(prefix\(([^)]*)\)|important|source\((?:none|"[^"]*"|'[^']*')\)|layer\([a-zA-Z0-9_.-]+\))(?=\s|$)/.exec(
              remaining,
            );
          if (!modifier) {
            warn('tailwind-target-unknown', `Unsupported Tailwind import modifiers: ${remaining}`);
            break;
          }
          const name = modifier[1]!.split('(')[0]!;
          if (seen.has(name)) warn('tailwind-target-unknown', `Repeated Tailwind import modifier ${name}.`);
          seen.add(name);
          if (name === 'prefix') {
            if (!validPrefix(modifier[2]!)) warn('tailwind-target-unknown', 'Invalid Tailwind v4 prefix.');
            else prefix = modifier[2]!;
          }
          if (name === 'important') important = true;
          if (modifier[1] === 'source(none)')
            warn('tailwind-source-excluded', 'source(none) disables automatic template discovery.');
          remaining = remaining.slice(modifier[0].length).trim();
        }
        if (imported === 'tailwindcss' || imported === 'tailwindcss/theme.css') defaultTheme = true;
        if (imported !== 'tailwindcss/preflight.css') operations.push({ kind: 'prefix', value: prefix, source });
        if (imported === 'tailwindcss' || imported === 'tailwindcss/utilities.css') {
          utilities = true;
          operations.push({ kind: 'important', value: important ? 'important' : 'normal', source });
        }
      } else if (imported.startsWith('./') || imported.startsWith('../')) {
        if (rule.parent?.type !== 'root' || modifiers.trim())
          warn('tailwind-import-unresolved', `Conditional import ${imported} was not loaded.`);
        else imports.push(imported);
      } else warn('tailwind-import-unresolved', `External import ${imported} was not loaded.`);
    }
    if (rule.name !== 'theme') return;
    if (
      rule.parent?.type !== 'root' ||
      (rule.params.trim() && !/^(?:inline|static)(?:\s+(?:inline|static))*$/.test(rule.params.trim()))
    ) {
      warn('tailwind-target-unknown', 'Conditional or unsupported @theme block was not resolved.');
      return;
    }
    rule.each(node => {
      if (node.type !== 'decl') return;
      if (node.prop === '--*') {
        if (node.value.trim() === 'initial' && !node.important) {
          operations.push({ kind: 'breakpoint', name: '*', value: null, source });
        } else warn('tailwind-target-unknown', 'Cannot resolve global theme reset.');
        return;
      }
      if (!node.prop.startsWith('--breakpoint-')) return;
      const name = node.prop.slice('--breakpoint-'.length);
      const value = node.value.trim();
      if (
        !/^(?:\*|[a-zA-Z0-9][a-zA-Z0-9_-]*)$/.test(name) ||
        node.important ||
        (value !== 'initial' && (name === '*' || !validBreakpoint(value)))
      ) {
        warn('tailwind-breakpoint-unknown', `Cannot resolve ${node.prop}: ${value}.`);
        if (/^(?:\*|[a-zA-Z0-9][a-zA-Z0-9_-]*)$/.test(name))
          operations.push({ kind: 'breakpoint', name, value: null, source });
        return;
      }
      operations.push({ kind: 'breakpoint', name, value: value === 'initial' ? null : value, source });
    });
  });
  return { operations, diagnostics, imports, tailwind, defaultTheme, utilities, source };
}

export function resolveTailwindTargetProfile(
  input: {
    readonly detected?: StylesheetAnalysis;
    readonly explicit?: TailwindTargetOverrides;
    readonly explicitSource?: string;
    readonly cli?: TailwindTargetOverrides;
  } = {},
): TailwindTargetProfile {
  let coreUtilities: TailwindTargetProfile['coreUtilities'] = {
    value: 'standard',
    source: input.detected?.source ?? 'default',
    confidence: input.detected ? 'detected' : 'defaulted',
  };
  let prefix: TargetSetting<string | null> = { value: null, source: 'default', confidence: 'defaulted' };
  let important: TailwindTargetProfile['important'] = { value: 'normal', source: 'default', confidence: 'defaulted' };
  let breakpoints: Record<string, TargetSetting<string>> = Object.fromEntries(
    Object.entries(input.detected && !input.detected.defaultTheme ? {} : defaults).map(([name, value]) => [
      name,
      { value, source: 'default', confidence: 'defaulted' },
    ]),
  );
  const diagnostics = [
    ...(input.detected?.diagnostics ?? []),
    ...(input.detected?.imports ?? []).map(imported => ({
      code: 'tailwind-import-unresolved' as const,
      message: `${input.detected!.source}: Local import ${imported} was not loaded in this analysis.`,
    })),
  ];
  function apply(operation: TargetOperation, confidence: TargetSetting<unknown>['confidence']): void {
    const { value, source } = operation;
    if (operation.kind === 'prefix') {
      if (value !== null && !validPrefix(value))
        throw new Error('Tailwind v4 prefix must contain only lowercase letters.');
      if (prefix.confidence !== 'defaulted' && prefix.value !== value)
        diagnostics.push({
          code: 'tailwind-prefix-conflict',
          message: `Using prefix ${String(value)} from ${source}; ${prefix.source} declared ${String(prefix.value)}.`,
        });
      prefix = { value, source, confidence };
    } else if (operation.kind === 'important') important = { value: operation.value, source, confidence };
    else if (operation.name === '*' && value === null) breakpoints = {};
    else if (value === null) delete breakpoints[operation.name];
    else {
      if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(operation.name) || !validBreakpoint(value))
        throw new Error(`Invalid Tailwind breakpoint ${operation.name}: ${value}`);
      breakpoints[operation.name] = { value, source, confidence };
    }
  }
  input.detected?.operations.forEach(operation => apply(operation, 'detected'));
  for (const [overrides, source] of [
    [input.explicit, input.explicitSource ?? 'migration profile'],
    [input.cli, 'CLI'],
  ] as const) {
    if (!overrides) continue;
    if (overrides.version !== undefined && overrides.version !== 4)
      throw new Error('Only Tailwind v4 targets are supported.');
    if (overrides.coreUtilities !== undefined) {
      if (overrides.coreUtilities !== 'standard')
        throw new Error('coreUtilities must be standard when explicitly asserted.');
      coreUtilities = { value: 'standard', source, confidence: 'explicit' };
    }
    if (overrides.prefix !== undefined) apply({ kind: 'prefix', value: overrides.prefix, source }, 'explicit');
    if (overrides.important !== undefined) {
      if (!['normal', 'important'].includes(overrides.important)) throw new Error('Invalid Tailwind important mode.');
      apply({ kind: 'important', value: overrides.important, source }, 'explicit');
    }
    const entries = Object.entries(overrides.breakpoints ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    for (const [name, value] of entries)
      apply({ kind: 'breakpoint', name, value: value === 'initial' ? null : value, source }, 'explicit');
  }
  breakpoints = Object.fromEntries(Object.entries(breakpoints).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  if (new Set(Object.values(breakpoints).map(setting => setting.value.match(/[a-z]+$/)![0])).size > 1)
    diagnostics.push({
      code: 'tailwind-mixed-breakpoint-units',
      message: 'Mixed breakpoint units may affect Tailwind variant ordering; units were preserved.',
    });
  if (input.detected && !input.detected.utilities)
    diagnostics.push({
      code: 'tailwind-target-unknown',
      message: 'The supplied stylesheet does not declare Tailwind utility generation.',
    });
  if (input.detected && !input.detected.tailwind)
    diagnostics.push({ code: 'tailwind-target-unknown', message: 'No supported Tailwind v4 import was detected.' });
  if (
    diagnostics.some(item =>
      [
        'tailwind-config-external',
        'tailwind-plugin-external',
        'tailwind-import-unresolved',
        'tailwind-target-unknown',
      ].includes(item.code),
    )
  ) {
    if (coreUtilities.confidence !== 'explicit')
      coreUtilities = { ...coreUtilities, value: 'unknown', confidence: 'unknown' };
    breakpoints = Object.fromEntries(
      Object.entries(breakpoints).map(([name, setting]) => [
        name,
        setting.confidence === 'explicit' ? setting : { ...setting, confidence: 'unknown' },
      ]),
    );
    if (prefix.confidence !== 'explicit') prefix = { ...prefix, confidence: 'unknown' };
    if (important.confidence !== 'explicit')
      important = { value: 'unknown', source: important.source, confidence: 'unknown' };
  }
  const assumptions = [
    'Custom application CSS is not globally analyzed.',
    'Responsive source ranges are preserved, including screen and print conditions.',
  ];
  if (!input.detected && !input.explicit && !input.cli)
    assumptions.push('Target profile uses Tailwind v4 defaults; project configuration was not discovered.');
  if (diagnostics.some(d => d.code === 'tailwind-config-external' || d.code === 'tailwind-plugin-external'))
    assumptions.push('Legacy JavaScript configuration and plugins were not executed.');
  if (coreUtilities.confidence === 'explicit')
    assumptions.push(
      'The migration profile explicitly asserts standard Tailwind core utility semantics; this assertion was not verified by executing project code.',
    );
  if (important.value === 'important')
    assumptions.push('Generated Tailwind utilities are globally important; existing styles still require review.');
  const canonical = JSON.stringify({
    version: 4,
    prefix: prefix.value,
    important: important.value,
    coreUtilities: coreUtilities.value,
    breakpoints: Object.fromEntries(Object.entries(breakpoints).map(([name, setting]) => [name, setting.value])),
  });
  return deepFreeze({
    target: 'tailwind',
    version: 4,
    prefix,
    important,
    coreUtilities,
    breakpoints,
    diagnostics,
    assumptions,
    fingerprint: `tw4-${sha256(canonical)}`,
    ...(input.detected ? { stylesheet: input.detected.source } : {}),
  });
}
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}
