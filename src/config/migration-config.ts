import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import postcss from 'postcss';
import {
  analyzeTailwindStylesheet,
  resolveTailwindTargetProfile,
  type StylesheetAnalysis,
  type TailwindTargetOverrides,
  type TargetDiagnostic,
  type TargetOperation,
} from './tailwind-target-profile';
import { sourceBreakpointDefinition, type SourceBreakpoints } from './source-breakpoints';

export interface ConfigurationSnapshot {
  readonly path: string;
  readonly digest: string;
  readonly canonicalPath: string;
}
export interface MigrationConfig {
  readonly target?: 'tailwind' | 'css';
  readonly tailwind?: TailwindTargetOverrides & { readonly stylesheet?: string };
  readonly source?: { readonly flexLayout?: { readonly breakpoints?: SourceBreakpoints } };
}
function object(value: unknown, allowed: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`Unknown ${label} setting: ${key}`);
  return value as Record<string, unknown>;
}
function parseConfig(contents: string): MigrationConfig {
  const config = object(JSON.parse(contents), ['target', 'tailwind', 'source'], 'migration config');
  if (config.target !== undefined && config.target !== 'tailwind' && config.target !== 'css')
    throw new Error('Invalid migration target.');
  if (config.tailwind !== undefined) {
    const tw = object(
      config.tailwind,
      ['version', 'stylesheet', 'prefix', 'breakpoints', 'important', 'coreUtilities'],
      'tailwind',
    );
    if (tw.stylesheet !== undefined && typeof tw.stylesheet !== 'string')
      throw new Error('Tailwind stylesheet must be a path.');
    if (tw.prefix !== undefined && tw.prefix !== null && typeof tw.prefix !== 'string')
      throw new Error('Tailwind prefix must be a string or null.');
    if (tw.breakpoints !== undefined) {
      if (!tw.breakpoints || typeof tw.breakpoints !== 'object' || Array.isArray(tw.breakpoints))
        throw new Error('Tailwind breakpoints must be an object.');
      for (const value of Object.values(tw.breakpoints))
        if (value !== null && typeof value !== 'string')
          throw new Error('Tailwind breakpoint values must be lengths or null.');
    }
  }
  if (config.source !== undefined) {
    const source = object(config.source, ['flexLayout'], 'source');
    if (source.flexLayout !== undefined) {
      const flex = object(source.flexLayout, ['breakpoints'], 'source.flexLayout');
      if (flex.breakpoints !== undefined) {
        if (!flex.breakpoints || typeof flex.breakpoints !== 'object' || Array.isArray(flex.breakpoints))
          throw new Error('Source breakpoints must be an object.');
        for (const [alias, value] of Object.entries(flex.breakpoints)) {
          object(value, ['mediaQuery', 'priority'], `source breakpoint ${alias}`);
          sourceBreakpointDefinition(alias, value as SourceBreakpoints[string]);
        }
      }
    }
  }
  return config as MigrationConfig;
}
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
function inside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
export async function assertConfigurationUnchanged(snapshots: readonly ConfigurationSnapshot[]): Promise<void> {
  for (const snapshot of snapshots) {
    let current: string;
    try {
      if ((await realpath(snapshot.path)) !== snapshot.canonicalPath) throw new Error('Configuration path changed.');
      current = digest(await readFile(snapshot.path, 'utf8'));
    } catch {
      throw new Error(`Target configuration changed or disappeared since planning: ${snapshot.path}`);
    }
    if (current !== snapshot.digest) throw new Error(`Target configuration changed since planning: ${snapshot.path}`);
  }
}
export async function loadMigrationConfig(options: {
  readonly cwd?: string;
  readonly config?: string;
  readonly stylesheet?: string;
  readonly prefix?: string;
}) {
  const root = await realpath(options.cwd ?? process.cwd());
  const snapshots: ConfigurationSnapshot[] = [];
  const read = async (file: string) => {
    const contents = await readFile(file, 'utf8');
    if (contents.length > 2_000_000) throw new Error('Configuration file exceeds the 2 MB static analysis limit.');
    if (!snapshots.some(snapshot => snapshot.path === file))
      snapshots.push(Object.freeze({ path: file, canonicalPath: await realpath(file), digest: digest(contents) }));
    return contents;
  };
  const configPath = path.resolve(root, options.config ?? 'flex-layout-migrator.config.json');
  if (!configPath.endsWith('.json')) throw new Error('Migration configuration must be declarative JSON.');
  let config: MigrationConfig = {};
  try {
    config = parseConfig(await read(configPath));
  } catch (error) {
    if (
      options.config !== undefined ||
      !(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
    )
      throw error;
  }
  const stylesheet =
    options.stylesheet === undefined
      ? config.tailwind?.stylesheet === undefined
        ? undefined
        : path.resolve(path.dirname(configPath), config.tailwind.stylesheet)
      : path.resolve(root, options.stylesheet);
  let detected: StylesheetAnalysis | undefined;
  if (stylesheet) {
    const operations: TargetOperation[] = [];
    const diagnostics: TargetDiagnostic[] = [];
    let tailwind = false;
    let defaultTheme = false;
    let utilities = false;
    let visited = 0;
    const relative = (file: string) => path.relative(root, file).split(path.sep).join('/');
    const visit = async (file: string, ancestors: readonly string[], depth: number): Promise<void> => {
      if (++visited > 128 || depth > 16)
        throw new Error('CSS import analysis limit exceeded (128 imports / depth 16).');
      const canonical = await realpath(file);
      if (!inside(root, canonical)) throw new Error('CSS import is outside the project root.');
      if (ancestors.includes(canonical)) throw new Error('CSS import cycle detected.');
      const contents = await read(file);
      const parsed = postcss.parse(contents, { from: undefined });
      for (const node of parsed.nodes) {
        const analysis = analyzeTailwindStylesheet(node.toString(), relative(canonical));
        operations.push(...analysis.operations);
        diagnostics.push(...analysis.diagnostics);
        tailwind ||= analysis.tailwind;
        defaultTheme ||= analysis.defaultTheme;
        utilities ||= analysis.utilities;
        for (const imported of analysis.imports) {
          try {
            await visit(path.resolve(path.dirname(canonical), imported), [...ancestors, canonical], depth + 1);
          } catch (error) {
            diagnostics.push({
              code: 'tailwind-import-unresolved',
              message: `${relative(canonical)}: ${imported}: ${error instanceof Error ? error.message : 'Import unresolved'}`,
            });
          }
        }
      }
    };
    await visit(stylesheet, [], 0);
    detected = {
      source: relative(stylesheet),
      operations,
      diagnostics,
      imports: [],
      defaultTheme,
      utilities,
      tailwind,
    };
  }
  const targetProfile = resolveTailwindTargetProfile({
    detected,
    explicit: config.tailwind,
    explicitSource: path.relative(root, configPath).split(path.sep).join('/'),
    ...(options.prefix !== undefined ? { cli: { prefix: options.prefix || null } } : {}),
  });
  return Object.freeze({
    target: config.target,
    targetProfile,
    sourceBreakpoints: config.source?.flexLayout?.breakpoints,
    snapshots: Object.freeze(snapshots),
  });
}
