import { execFile, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, test } from 'vitest';

const execFileAsync = promisify(execFile);
const repository = fileURLToPath(new URL('../../', import.meta.url));
const baselineUrl = new URL('../../docs/maintenance/2026-09-03-enterprise-architecture-baseline.md', import.meta.url);
const slice3Url = new URL('../../docs/maintenance/2026-09-03-enterprise-discovery-analysis.md', import.meta.url);
const slice4Url = new URL(
  '../../docs/maintenance/2026-09-04-enterprise-shared-semantics-rendering.md',
  import.meta.url,
);
const finalUrl = new URL('../../docs/maintenance/2026-09-04-enterprise-architecture-final.md', import.meta.url);
const finalBenchmarkPath = 'docs/maintenance/evidence/2026-09-04-enterprise-architecture-final-benchmark.json';
const finalBenchmarkUrl = new URL(`../../${finalBenchmarkPath}`, import.meta.url);

interface ArchitectureInventory {
  readonly productionEntrypoint: string;
  readonly reachableProductionModules: readonly string[];
  readonly unreachableProductionModules: readonly string[];
  readonly productionFiles: readonly { readonly path: string; readonly lines: number }[];
  readonly largestFiles: readonly { readonly path: string; readonly lines: number }[];
  readonly moduleEdges: readonly {
    readonly from: string;
    readonly kind: 'relative' | 'external' | 'builtin';
    readonly to: string;
  }[];
  readonly policyOwners: readonly { readonly policy: string; readonly module: string; readonly symbol: string }[];
  readonly runtimeDependencies: readonly {
    readonly name: string;
    readonly declared: string | null;
    readonly resolved: string | null;
    readonly importedBy: readonly string[];
    readonly status: 'used' | 'unused';
  }[];
  readonly runtimeDependencyViolations: readonly unknown[];
}

interface BenchmarkSummary {
  readonly milliseconds: readonly number[];
  readonly medianMilliseconds: number;
  readonly minMilliseconds: number;
  readonly maxMilliseconds: number;
  readonly medianAbsoluteDeviationMilliseconds: number;
}

interface BenchmarkScenario extends BenchmarkSummary {
  readonly name: string;
  readonly peakRssBytes: readonly number[];
}

interface BenchmarkReport {
  readonly generatedAt: string;
  readonly node: string;
  readonly platform: string;
  readonly commit: string;
  readonly warmups: number;
  readonly samples: number;
  readonly scenarios: readonly BenchmarkScenario[];
  readonly architectureTest: BenchmarkSummary & { readonly command: string };
}

interface PackageDescriptor {
  readonly size: number;
  readonly unpackedSize: number;
  readonly entryCount: number;
  readonly bundled: readonly string[];
  readonly files: readonly { readonly path: string; readonly size: number }[];
}

interface PackageManifest {
  readonly packageManager: string;
}

interface NpmDependencyNode {
  readonly name?: string;
  readonly version: string;
  readonly path?: string;
  readonly dependencies?: Readonly<Record<string, NpmDependencyNode>>;
}

const requiredSections = [
  'Commit',
  'Environment',
  'Behavior oracle',
  'Workload counters',
  'Production structure',
  'Runtime dependencies',
  'Benchmark method',
  'Benchmark results',
  'Architecture-test timing',
  'Known hotspots',
  'Rewrite acceptance gates',
] as const;

const finalRequiredSections = [
  'Commit',
  'Environment',
  'Final route',
  'Ownership map',
  'Inventory evidence',
  'Dependency and license audit',
  'Workload counters',
  'Application counters',
  'Package evidence',
  'Public parity evidence',
  'Benchmark method',
  'Benchmark input digests',
  'Benchmark results',
  'Architecture-test timing',
  'Slice 1 comparison',
  'Runtime license inventory',
  'Retained debt',
] as const;

const largestProductionModules = [
  ['src/transaction/migration-transaction.ts', '1,245'],
  ['src/adapter/tailwind/tailwind.adapter.ts', '686'],
  ['src/adapter/tailwind/tailwind-class-conflict.ts', '650'],
  ['src/adapter/tailwind/extended/tailwind-candidate-classifier.ts', '629'],
  ['src/adapter/responsive-family.planner.ts', '556'],
  ['src/adapter/tailwind/extended/extended-display-composition.planner.ts', '526'],
  ['src/adapter/css/css.adapter.ts', '438'],
  ['src/adapter/tailwind/extended/extended-responsive.planner.ts', '430'],
  ['src/adapter/tailwind/extended/tailwind-arbitrary-value-ownership.ts', '373'],
  ['src/analyzer/compatibility-inventory.ts', '331'],
  ['src/adapter/tailwind/extended/css-property-ownership.ts', '298'],
  ['src/adapter/tailwind/extended/generated-property-composition.planner.ts', '276'],
  ['src/planner/conversion-planner.ts', '266'],
  ['src/migrator/migration-path.validator.ts', '261'],
  ['src/migrator/migrator.ts', '247'],
  ['src/adapter/css/stylesheet/owned-stylesheet.merger.ts', '245'],
  ['src/adapter/tailwind/visibility/display-composition.planner.ts', '237'],
  ['src/adapter/tailwind/extended/extended-family.planner.ts', '219'],
  ['src/adapter/tailwind/extended/responsive-style-value.parser.ts', '202'],
  ['src/adapter/tailwind/visibility/literal-style-display.ts', '188'],
] as const;

const workloadRows = [
  ['Single-file Tailwind plan', '1', '1', '1', '1', '1', '1', '0', '0'],
  ['Single-file Tailwind write', '1', '1', '1', '1', '1', '1', '0', '1'],
  ['Two-file CSS folder plan', '1', '2', '2', '2', '4', '2', '0', '0'],
  ['Two-file CSS folder write', '1', '2', '2', '2', '4', '2', '0', '3'],
  ['Unchanged Tailwind rerun', '1', '1', '2', '1', '1', '1', '0', '0'],
  ['Unchanged CSS folder rerun', '1', '2', '6', '2', '4', '2', '1', '0'],
] as const;

const slice3WorkloadRows = [
  ['Single-file Tailwind plan', '1', '1', '1', '1', '1', '1', '0', '0'],
  ['Single-file Tailwind write', '1', '1', '1', '1', '1', '1', '0', '1'],
  ['Two-file CSS folder plan', '1', '2', '2', '2', '2', '2', '0', '0'],
  ['Two-file CSS folder write', '1', '2', '2', '2', '2', '2', '0', '3'],
  ['Unchanged Tailwind rerun', '1', '1', '1', '1', '1', '1', '0', '0'],
  ['Unchanged CSS folder rerun', '1', '2', '2', '2', '2', '2', '1', '0'],
] as const;

const slice4InventoryRows = [
  ['Production TypeScript files', '122', '164'],
  ['Runtime dependency entries', '5', '5'],
  ['Static internal and runtime external or built-in module edges', '416', '614'],
  ['Known policy owners', '6', '6'],
] as const;

const finalWorkloadRows = [
  ['Single-file Tailwind plan', '1', '1', '1', '0', '1', '1', '0', '1', '1', '1', '0'],
  ['Single-file Tailwind write', '1', '1', '1', '0', '1', '1', '0', '1', '1', '1', '0'],
  ['Two-file CSS folder plan', '1', '2', '2', '0', '2', '2', '2', '2', '2', '1', '0'],
  ['Two-file CSS folder write', '1', '2', '2', '0', '2', '2', '2', '2', '2', '1', '0'],
  ['Unchanged Tailwind rerun', '1', '1', '1', '1', '1', '1', '0', '1', '1', '1', '0'],
  ['Unchanged CSS folder rerun', '1', '2', '2', '4', '2', '2', '2', '2', '2', '1', '1'],
] as const;

const finalApplicationRows = [
  ['Single-file Tailwind plan', '5', '1', '0', '0', '0', '0', '0'],
  ['Single-file Tailwind write', '5', '1', '1', '1', '1', '0', '2'],
  ['Two-file CSS folder plan', '5', '1', '0', '0', '0', '0', '0'],
  ['Two-file CSS folder write', '5', '1', '3', '2', '3', '0', '6'],
  ['Unchanged Tailwind rerun', '5', '1', '0', '0', '0', '0', '0'],
  ['Unchanged CSS folder rerun', '5', '1', '0', '0', '0', '0', '0'],
] as const;

const slice4PolicyOwnerRows = [
  ['artifact identity', 'src/adapter/css/css-artifact.registry.ts', 'CssArtifactRegistry'],
  ['breakpoint classification', 'src/breakpoint/breakpoint-catalog.ts', 'BreakpointCatalog'],
  ['diagnostics', 'src/analyzer/conversion-result.ts', 'DiagnosticCode'],
  ['responsive precedence', 'src/semantic/responsive-family.planner.ts', 'ResponsiveFamilyPlanner'],
  ['semantic planning', 'src/semantic/element-semantic.planner.ts', 'ElementSemanticPlanner'],
  ['transaction recovery', 'src/transaction/migration-transaction.ts', 'MigrationTransaction'],
] as const;

const renderLifecycleRows = [
  ['Single-file Tailwind plan', '1', '1', '1', '1'],
  ['Single-file Tailwind write', '1', '1', '1', '1'],
  ['Two-file CSS folder plan', '2', '2', '2', '1'],
  ['Two-file CSS folder write', '2', '2', '2', '1'],
  ['Unchanged Tailwind rerun', '1', '1', '1', '1'],
  ['Unchanged CSS folder rerun', '2', '2', '2', '1'],
] as const;

const targetRenderRows = [
  ['Single-file Tailwind plan', '1', '1'],
  ['Single-file Tailwind write', '1', '1'],
  ['Two-file CSS folder plan', '2', '2'],
  ['Two-file CSS folder write', '2', '2'],
  ['Unchanged Tailwind rerun', '1', '1'],
  ['Unchanged CSS folder rerun', '2', '2'],
] as const;

const policyOwnerRows = [
  ['artifact identity', 'src/adapter/css/css-artifact.registry.ts', 'CssArtifactRegistry'],
  ['breakpoint classification', 'src/breakpoint/breakpoint-catalog.ts', 'BreakpointCatalog'],
  ['diagnostics', 'src/analyzer/conversion-result.ts', 'DiagnosticCode'],
  ['responsive precedence', 'src/adapter/responsive-family.planner.ts', 'SharedResponsiveFamilyPlanner'],
  ['semantic planning', 'src/planner/conversion-planner.ts', 'ConversionPlanner'],
  ['transaction recovery', 'src/transaction/migration-transaction.ts', 'MigrationTransaction'],
] as const;

const runtimeDependencyRows = [
  [
    '@angular/compiler',
    'declared, used',
    'Angular template parsing',
    '21.2.22',
    '21.2.22',
    'src/template/angular-template.parser.ts',
  ],
  ['commander', 'declared, used', 'CLI command and option parsing', '^15.0.0', '15.0.0', 'src/cli/run-cli.ts'],
  [
    'fs-extra',
    'declared, used',
    'Filesystem traversal and copy helpers',
    '^11.4.0',
    '11.4.0',
    'src/lib/gitignore.helper.ts',
  ],
  [
    'ignore',
    'undeclared, used',
    'Gitignore-compatible path filtering',
    'not declared',
    '5.2.4',
    'src/lib/gitignore.helper.ts',
  ],
  ['winston', 'declared, used', 'Application logging', '^3.19.0', '3.19.0', 'src/logger.ts'],
] as const;

function tableRows(markdown: string, heading: string): string[][] {
  const start = markdown.indexOf(`## ${heading}`);
  if (start === -1) throw new Error(`Missing baseline section: ${heading}`);
  const remainder = markdown.slice(start + heading.length + 3);
  const end = remainder.search(/^## /mu);
  const section = end === -1 ? remainder : remainder.slice(0, end);

  return section
    .split('\n')
    .filter(line => line.startsWith('|') && !/^\|\s*:?-+/u.test(line))
    .slice(1)
    .map(line =>
      line
        .slice(1, -1)
        .split('|')
        .map(cell => cell.trim().replaceAll('`', '')),
    );
}

function capturedCommit(markdown: string): string {
  const commit = markdown.match(/Commit captured: `([0-9a-f]{40})`/u)?.[1];
  if (commit === undefined) throw new Error('Missing captured commit.');
  return commit;
}

function environmentValue(markdown: string, label: string): string {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const value = markdown.match(new RegExp(`^- ${escapedLabel}: \\x60([^\\x60]+)\\x60$`, 'mu'))?.[1];
  if (value === undefined) throw new Error(`Missing environment value: ${label}`);
  return value;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function numberList(cell: string): number[] {
  return cell.split('; ').map(value => Number(value));
}

function summarizeMeasurements(values: readonly number[]): Omit<BenchmarkSummary, 'milliseconds'> {
  if (values.length === 0 || values.some(value => !Number.isFinite(value))) {
    throw new Error('Benchmark evidence requires finite samples.');
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0 ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2 : (sorted[middle] ?? 0);
  const deviations = values.map(value => Math.abs(value - median)).sort((left, right) => left - right);
  const deviationMiddle = Math.floor(deviations.length / 2);
  const medianAbsoluteDeviation =
    deviations.length % 2 === 0
      ? ((deviations[deviationMiddle - 1] ?? 0) + (deviations[deviationMiddle] ?? 0)) / 2
      : (deviations[deviationMiddle] ?? 0);
  return {
    medianMilliseconds: median,
    minMilliseconds: Math.min(...values),
    maxMilliseconds: Math.max(...values),
    medianAbsoluteDeviationMilliseconds: medianAbsoluteDeviation,
  };
}

async function generateRepositoryInventory(): Promise<ArchitectureInventory> {
  const directory = await mkdtemp(join(tmpdir(), 'final-architecture-inventory-'));
  const output = join(directory, 'inventory.json');
  try {
    await execFileAsync(process.execPath, ['scripts/architecture-inventory.mjs', '--json', output], {
      cwd: repository,
    });
    return JSON.parse(await readFile(output, 'utf8')) as ArchitectureInventory;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function generatePackageDescriptor(): Promise<PackageDescriptor> {
  const executable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const { stdout } = await execFileAsync(executable, ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: repository,
    encoding: 'utf8',
  });
  const descriptors = JSON.parse(stdout) as readonly PackageDescriptor[];
  if (descriptors.length !== 1 || descriptors[0] === undefined) {
    throw new Error('Expected one npm package descriptor.');
  }
  return descriptors[0];
}

async function generateRuntimeLicenses(): Promise<ReadonlyMap<string, string>> {
  const executable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const { stdout } = await execFileAsync(executable, ['ls', '--omit=dev', '--all', '--json', '--long'], {
    cwd: repository,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  const tree = JSON.parse(stdout) as { readonly dependencies?: Readonly<Record<string, NpmDependencyNode>> };
  const nodes = new Map<string, { readonly name: string; readonly node: NpmDependencyNode }>();

  function visit(dependencies: Readonly<Record<string, NpmDependencyNode>> = {}): void {
    for (const [key, node] of Object.entries(dependencies)) {
      const name = node.name ?? key;
      const id = `${name}@${node.version}`;
      if (!nodes.has(id) || node.path !== undefined) nodes.set(id, { name, node });
      visit(node.dependencies);
    }
  }

  visit(tree.dependencies);
  const licenses = new Map<string, string>();
  for (const [id, { name, node }] of nodes) {
    const packagePath = node.path ?? join(repository, 'node_modules', ...name.split('/'));
    const metadata = JSON.parse(await readFile(join(packagePath, 'package.json'), 'utf8')) as {
      readonly name: string;
      readonly version: string;
      readonly license?: string;
    };
    if (metadata.name !== name || metadata.version !== node.version || metadata.license === undefined) {
      throw new Error(`Incomplete runtime license metadata: ${id}`);
    }
    licenses.set(id, metadata.license);
  }
  return licenses;
}

function groupedLicenseRows(licenses: ReadonlyMap<string, string>): string[][] {
  const groups = new Map<string, string[]>();
  for (const [id, license] of licenses) {
    const packages = groups.get(license) ?? [];
    packages.push(id);
    groups.set(license, packages);
  }
  return [...groups]
    .sort(([left], [right]) => compareCodeUnits(left, right))
    .map(([license, packages]) => [license, String(packages.length), packages.sort(compareCodeUnits).join('; ')]);
}

function gitText(arguments_: readonly string[]): string {
  return execFileSync('git', arguments_, { cwd: repository, encoding: 'utf8' });
}

function digestGitPath(commit: string, target: string): string {
  const type = gitText(['cat-file', '-t', `${commit}:${target}`]).trim();
  const files =
    type === 'tree'
      ? gitText(['ls-tree', '-r', '--name-only', '-z', commit, '--', target])
          .split('\0')
          .filter(Boolean)
          .sort(compareCodeUnits)
      : [target];
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(file);
    hash.update('\0');
    hash.update(execFileSync('git', ['show', `${commit}:${file}`], { cwd: repository }));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function benchmarkInputDigests(baselineCommit: string, finalCommit: string): readonly string[][] {
  const inputs: ReadonlyArray<readonly [label: string, target: string]> = [
    ['Runner', 'scripts/benchmark/architecture-benchmark.mjs'],
    ['Memory probe', 'scripts/benchmark/memory-probe.mjs'],
    ['Product fixtures', 'benchmark/fixtures'],
    ['Architecture boundary test', 'test/architecture/enterprise-pipeline-boundary.test.ts'],
  ];
  return inputs.map(([label, target]) => {
    const baseline = digestGitPath(baselineCommit, target);
    const final = digestGitPath(finalCommit, target);
    return [label, baseline, final, baseline === final ? 'identical' : 'different; not comparable'];
  });
}

function wallClockThresholdSegments(markdown: string): readonly string[] {
  const proseAndTableSegments = markdown.match(/[^.!?\n]+[.!?]?/gu) ?? [];
  return proseAndTableSegments.filter(
    segment =>
      /\b(?:\d{1,3}(?:,\d{3})*|\d+)(?:\.\d+)?\s*(?:milliseconds?|ms|seconds?|secs?|s|microseconds?|[µμ]s|us|minutes?|mins?|min)\b/iu.test(
        segment,
      ) &&
      /\b(?:CI|thresholds?|gates?|fail(?:ed|ing|s|ures?)?|limits?|budgets?|above|below|ceilings?|caps?)\b/iu.test(
        segment,
      ),
  );
}

describe('enterprise architecture baseline documentation contract', () => {
  test('records every required baseline evidence section', async () => {
    const markdown = await readFile(baselineUrl, 'utf8');

    for (const section of requiredSections) expect(markdown).toContain(`## ${section}`);
    expect(markdown).toMatch(/Commit captured: `[0-9a-f]{40}`/u);
    expect(markdown).toMatch(/Node\.js: `v\d+\.\d+\.\d+`/u);
    expect(markdown).toMatch(/npm: `\d+\.\d+\.\d+`/u);
  });

  test('freezes the stable production structure and runtime dependency baseline', async () => {
    const markdown = await readFile(baselineUrl, 'utf8');

    expect(tableRows(markdown, 'Production structure')).toEqual([
      ['Production TypeScript files', '122'],
      ['Runtime dependency entries', '5'],
      ['Static internal and runtime external or built-in module edges', '416'],
      ['Known policy owners', '6'],
    ]);
    expect(tableRows(markdown, 'Largest production modules')).toEqual(largestProductionModules);
    expect(tableRows(markdown, 'Policy owners')).toEqual(policyOwnerRows);
    expect(tableRows(markdown, 'Runtime dependencies')).toEqual(runtimeDependencyRows);
  });

  test('freezes the public oracle, benchmark method, and deterministic workload counters', async () => {
    const markdown = await readFile(baselineUrl, 'utf8');

    for (const parityCase of [
      'Tailwind Flex and Grid migration',
      'native CSS Flex migration',
      'responsive image migration',
    ]) {
      expect(markdown).toContain(`\`${parityCase}\``);
    }
    expect(tableRows(markdown, 'Benchmark results').map(row => row[0])).toEqual([
      'single-tailwind-plan',
      'multi-tailwind-plan',
      'multi-native-css-plan',
      'unchanged-write',
    ]);
    const architectureTestRows = tableRows(markdown, 'Architecture-test timing');
    expect(architectureTestRows).toHaveLength(1);
    expect(architectureTestRows[0]?.[0]).toBe(
      'node node_modules/vitest/vitest.mjs run test/architecture/enterprise-pipeline-boundary.test.ts',
    );
    expect(architectureTestRows[0]?.[1]?.split('; ')).toHaveLength(5);
    expect(markdown).toContain('Warm-up runs per scenario: **1**');
    expect(markdown).toContain('Recorded samples per scenario: **5**');
    expect(tableRows(markdown, 'Workload counters')).toEqual(workloadRows);
  });

  test('never makes a machine-specific wall-clock observation a CI threshold', async () => {
    const markdown = await readFile(baselineUrl, 'utf8');

    expect(wallClockThresholdSegments(markdown)).toEqual([]);
  });

  test('publishes Slice 3 ownership, inventory, workload, and observational benchmark evidence', async () => {
    const markdown = await readFile(slice3Url, 'utf8');

    for (const section of [
      'Commit',
      'Environment',
      'Behavior oracle',
      'Workload counters',
      'Inventory evidence',
      'Benchmark method',
      'Benchmark results',
      'Architecture-test timing',
      'Ownership transition',
      'Retained compatibility',
    ]) {
      expect(markdown).toContain(`## ${section}`);
    }
    expect(markdown).toMatch(/Commit captured: `[0-9a-f]{40}`/u);
    expect(markdown).toMatch(/Node\.js: `v\d+\.\d+\.\d+`/u);
    expect(markdown).toMatch(/npm: `\d+\.\d+\.\d+`/u);
    expect(tableRows(markdown, 'Workload counters')).toEqual(slice3WorkloadRows);
    expect(tableRows(markdown, 'Benchmark results').map(row => row[0])).toEqual([
      'single-tailwind-plan',
      'multi-tailwind-plan',
      'multi-native-css-plan',
      'unchanged-write',
    ]);
    expect(tableRows(markdown, 'Architecture-test timing')[0]?.[1]?.split('; ')).toHaveLength(5);
    expect(markdown).toContain('Timings are observational');
    expect(wallClockThresholdSegments(markdown)).toEqual([]);
  });

  test('publishes Slice 4 semantic, renderer, lifecycle, inventory, and benchmark evidence', async () => {
    const markdown = await readFile(slice4Url, 'utf8');

    for (const section of [
      'Commit',
      'Environment',
      'Behavior oracle',
      'Workload counters',
      'Render lifecycle counters',
      'Target render counters',
      'Inventory evidence',
      'Policy owners',
      'Benchmark method',
      'Benchmark results',
      'Architecture-test timing',
      'Ownership transition',
      'Retained compatibility',
    ]) {
      expect(markdown).toContain(`## ${section}`);
    }
    expect(markdown).toMatch(/Commit captured: `[0-9a-f]{40}`/u);
    expect(markdown).toMatch(/Node\.js: `v\d+\.\d+\.\d+`/u);
    expect(markdown).toMatch(/npm: `\d+\.\d+\.\d+`/u);
    expect(tableRows(markdown, 'Workload counters')).toEqual(slice3WorkloadRows);
    expect(tableRows(markdown, 'Render lifecycle counters')).toEqual(renderLifecycleRows);
    expect(tableRows(markdown, 'Target render counters')).toEqual(targetRenderRows);
    expect(tableRows(markdown, 'Inventory evidence')).toEqual(slice4InventoryRows);
    expect(tableRows(markdown, 'Policy owners')).toEqual(slice4PolicyOwnerRows);
    expect(tableRows(markdown, 'Benchmark results').map(row => row[0])).toEqual([
      'single-tailwind-plan',
      'multi-tailwind-plan',
      'multi-native-css-plan',
      'unchanged-write',
    ]);
    expect(tableRows(markdown, 'Benchmark results').every(row => row[1]?.split('; ').length === 5)).toBe(true);
    expect(tableRows(markdown, 'Architecture-test timing')[0]?.[1]?.split('; ')).toHaveLength(5);
    expect(markdown).toContain('Timings are observational');
    expect(markdown).toContain('No repeatable median improvement is claimed');
    expect(wallClockThresholdSegments(markdown)).toEqual([]);
  });

  test('publishes the complete final architecture evidence contract', async () => {
    const markdown = await readFile(finalUrl, 'utf8');

    for (const section of finalRequiredSections) expect(markdown).toContain(`## ${section}`);
    expect(markdown).toContain('CLI -> Discover -> Analyze -> Render -> Validate -> Apply -> Presentation');
    expect(tableRows(markdown, 'Workload counters')).toEqual(finalWorkloadRows);
    expect(tableRows(markdown, 'Application counters')).toEqual(finalApplicationRows);
    expect(markdown).toContain('No repeatable median improvement is claimed');
    expect(wallClockThresholdSegments(markdown)).toEqual([]);
  });

  test('binds the final inventory, dependency rows, package descriptor, commit, and environment to generated evidence', async () => {
    const [markdown, benchmarkText, packageText, inventory, descriptor, licenses] = await Promise.all([
      readFile(finalUrl, 'utf8'),
      readFile(finalBenchmarkUrl, 'utf8'),
      readFile(new URL('../../package.json', import.meta.url), 'utf8'),
      generateRepositoryInventory(),
      generatePackageDescriptor(),
      generateRuntimeLicenses(),
    ]);
    const benchmark = JSON.parse(benchmarkText) as BenchmarkReport;
    const manifest = JSON.parse(packageText) as PackageManifest;

    expect(() => gitText(['ls-files', '--error-unmatch', finalBenchmarkPath])).not.toThrow();
    expect(capturedCommit(markdown)).toBe(benchmark.commit);
    expect(() => gitText(['cat-file', '-e', `${benchmark.commit}^{commit}`])).not.toThrow();
    expect(environmentValue(markdown, 'Node.js')).toBe(benchmark.node);
    expect(environmentValue(markdown, 'Platform')).toBe(benchmark.platform);
    expect(environmentValue(markdown, 'npm')).toBe(manifest.packageManager.replace(/^npm@/u, ''));
    expect(markdown).toContain(`Generated at \`${benchmark.generatedAt}\` from the tracked benchmark artifact.`);
    expect(() =>
      gitText([
        'diff',
        '--quiet',
        benchmark.commit,
        '--',
        'src',
        'package.json',
        'package-lock.json',
        'benchmark',
        'scripts/benchmark',
      ]),
    ).not.toThrow();

    const edgeCount = (kind: ArchitectureInventory['moduleEdges'][number]['kind']): number =>
      inventory.moduleEdges.filter(edge => edge.kind === kind).length;
    expect(tableRows(markdown, 'Inventory evidence')).toEqual([
      ['Production TypeScript files', String(inventory.productionFiles.length)],
      ['Relative internal module edges', String(edgeCount('relative'))],
      ['Runtime external module edges', String(edgeCount('external'))],
      ['Runtime built-in module edges', String(edgeCount('builtin'))],
      ['Known policy owners', String(inventory.policyOwners.length)],
    ]);
    expect(markdown).toContain(`There are ${inventory.moduleEdges.length} total recorded module edges.`);
    expect(inventory.productionEntrypoint).toBe('src/main.ts');
    expect(inventory.reachableProductionModules).toHaveLength(inventory.productionFiles.length);
    expect(inventory.unreachableProductionModules).toEqual([]);
    expect(markdown).toContain(`all ${inventory.productionFiles.length} production modules are reachable`);
    expect(inventory.runtimeDependencyViolations).toEqual([]);
    expect(markdown).toContain('The runtime-dependency violation list is empty.');
    expect(tableRows(markdown, 'Policy owners')).toEqual(
      inventory.policyOwners.map(owner => [owner.policy, owner.module, owner.symbol]),
    );
    expect(tableRows(markdown, 'Largest production modules')).toEqual(
      inventory.largestFiles.map(file => [file.path, String(file.lines)]),
    );

    const dependencyRows = tableRows(markdown, 'Dependency and license audit');
    expect(dependencyRows).toHaveLength(inventory.runtimeDependencies.length);
    for (const dependency of inventory.runtimeDependencies) {
      const row = dependencyRows.find(candidate => candidate[0] === dependency.name);
      expect(row, dependency.name).toBeDefined();
      expect(row?.[1]).toBe(`declared, ${dependency.status}`);
      expect(row?.[2]).toBeTruthy();
      expect(row?.[3]).toBe(dependency.declared);
      expect(row?.[4]).toBe(dependency.resolved);
      expect(row?.[5]).toBe(dependency.importedBy.join('; '));
      expect(row?.[6]).toBe(licenses.get(`${dependency.name}@${dependency.resolved}`));
      expect(row?.[7]).toBe('External runtime install; not npm-bundled');
      expect(row?.[8]).toBeTruthy();
    }

    expect(descriptor.bundled).toEqual([]);
    expect(tableRows(markdown, 'Package evidence')).toEqual(
      descriptor.files.map(file => [file.path, file.size.toLocaleString('en-US')]),
    );
    expect(markdown).toContain(
      `reported exactly ${descriptor.entryCount} files with a ` +
        `${descriptor.unpackedSize.toLocaleString('en-US')}-byte unpacked size and no bundled dependencies`,
    );
    expect(markdown).toContain('The locally observed compressed tarball size was 264,268 bytes');
  }, 30_000);

  test('recomputes tracked benchmark summaries and compares only byte-identical workloads with Slice 1', async () => {
    const [markdown, baseline, benchmarkText] = await Promise.all([
      readFile(finalUrl, 'utf8'),
      readFile(baselineUrl, 'utf8'),
      readFile(finalBenchmarkUrl, 'utf8'),
    ]);
    const benchmark = JSON.parse(benchmarkText) as BenchmarkReport;

    expect(markdown).toContain(`Warm-up runs per scenario: **${benchmark.warmups}**`);
    expect(markdown).toContain(`Recorded samples per scenario: **${benchmark.samples}**`);
    const benchmarkRows = tableRows(markdown, 'Benchmark results');
    expect(benchmarkRows).toHaveLength(benchmark.scenarios.length);
    for (const scenario of benchmark.scenarios) {
      const summary = summarizeMeasurements(scenario.milliseconds);
      expect(scenario).toMatchObject(summary);
      expect(scenario.milliseconds).toHaveLength(benchmark.samples);
      expect(scenario.peakRssBytes).toHaveLength(benchmark.samples);
      expect(benchmarkRows.find(row => row[0] === scenario.name)).toEqual([
        scenario.name,
        scenario.milliseconds.join('; '),
        String(summary.medianMilliseconds),
        String(summary.minMilliseconds),
        String(summary.maxMilliseconds),
        String(summary.medianAbsoluteDeviationMilliseconds),
        scenario.peakRssBytes.join('; '),
      ]);
    }

    const architectureSummary = summarizeMeasurements(benchmark.architectureTest.milliseconds);
    expect(benchmark.architectureTest).toMatchObject(architectureSummary);
    expect(benchmark.architectureTest.milliseconds).toHaveLength(benchmark.samples);
    expect(tableRows(markdown, 'Architecture-test timing')).toEqual([
      [
        benchmark.architectureTest.command,
        benchmark.architectureTest.milliseconds.join('; '),
        String(architectureSummary.medianMilliseconds),
        String(architectureSummary.minMilliseconds),
        String(architectureSummary.maxMilliseconds),
        String(architectureSummary.medianAbsoluteDeviationMilliseconds),
      ],
    ]);

    const digests = benchmarkInputDigests(capturedCommit(baseline), benchmark.commit);
    expect(tableRows(markdown, 'Benchmark input digests')).toEqual(digests);
    expect(digests.slice(0, 3).every(row => row[3] === 'identical')).toBe(true);
    expect(digests[3]?.[3]).toBe('different; not comparable');

    const baselineRows = tableRows(baseline, 'Benchmark results');
    const comparisonRows = benchmark.scenarios.map(scenario => {
      const baselineRow = baselineRows.find(row => row[0] === scenario.name);
      if (baselineRow === undefined) throw new Error(`Missing Slice 1 benchmark scenario: ${scenario.name}`);
      const baselineMedian = summarizeMeasurements(numberList(baselineRow[1] ?? '')).medianMilliseconds;
      const finalMedian = summarizeMeasurements(scenario.milliseconds).medianMilliseconds;
      const delta = finalMedian - baselineMedian;
      const percentage = (delta / baselineMedian) * 100;
      return [
        scenario.name,
        String(baselineMedian),
        String(finalMedian),
        String(delta),
        `${percentage >= 0 ? '+' : ''}${percentage.toFixed(2)}%`,
      ];
    });
    expect(tableRows(markdown, 'Slice 1 comparison')).toEqual(comparisonRows);
    expect(markdown).toContain(
      'The architecture boundary test changed between Slice 1 and the final capture, so its timing is not comparable.',
    );
  });

  test('covers every installed runtime package/version instance in the generated license inventory', async () => {
    const [markdown, licenses] = await Promise.all([readFile(finalUrl, 'utf8'), generateRuntimeLicenses()]);
    const licenseRows = tableRows(markdown, 'Runtime license inventory');

    expect(licenseRows).toEqual(groupedLicenseRows(licenses));
    expect(licenseRows.reduce((count, row) => count + Number(row[1]), 0)).toBe(licenses.size);
    expect(markdown).toContain(`resolved ${licenses.size} unique runtime package/version instances`);
  }, 30_000);

  test.each([
    'CI fails above 2s.',
    'Runtime limit: 250 ms.',
    'The timing budget is 400 µs.',
    '| architecture test | below | 12 us |',
    'The merge gate allows 3 minutes.',
    '| command | threshold | 4 min |',
  ])('rejects a wall-clock threshold written as %s', text => {
    expect(wallClockThresholdSegments(text)).toEqual([text]);
  });

  test.each([
    'Observed runtime was 2s, 250 ms, 400 µs, 12 us, and 3 minutes.',
    '| scenario | samples | median | minimum | maximum | MAD |\n| enterprise | 10 ms; 12 ms | 11 ms | 10 ms | 12 ms | 1 ms |',
  ])('allows observational benchmark text written as %s', text => {
    expect(wallClockThresholdSegments(text)).toEqual([]);
  });
});
