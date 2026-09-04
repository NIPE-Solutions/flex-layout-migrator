import { readFile } from 'node:fs/promises';
import { describe, expect, test } from 'vitest';

const baselineUrl = new URL('../../docs/maintenance/2026-09-03-enterprise-architecture-baseline.md', import.meta.url);
const slice3Url = new URL('../../docs/maintenance/2026-09-03-enterprise-discovery-analysis.md', import.meta.url);

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
