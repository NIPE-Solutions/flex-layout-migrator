import { readFile } from 'node:fs/promises';
import { describe, expect, test } from 'vitest';

const baselineUrl = new URL('../../docs/maintenance/2026-09-03-enterprise-architecture-baseline.md', import.meta.url);

const requiredSections = [
  'Commit',
  'Environment',
  'Behavior oracle',
  'Workload counters',
  'Production structure',
  'Runtime dependencies',
  'Benchmark method',
  'Benchmark results',
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
  ['src/adapter/css/stylesheet/owned-stylesheet.merger.ts', '245'],
  ['src/migrator/migrator.ts', '244'],
  ['src/adapter/tailwind/visibility/display-composition.planner.ts', '237'],
  ['src/adapter/tailwind/extended/extended-family.planner.ts', '219'],
  ['src/adapter/tailwind/extended/responsive-style-value.parser.ts', '202'],
  ['src/adapter/tailwind/visibility/literal-style-display.ts', '188'],
] as const;

const workloadRows = [
  ['Single-file Tailwind plan', '1', '1', '1', '1', '1', '0', '0'],
  ['Single-file Tailwind write', '1', '1', '1', '1', '1', '0', '1'],
  ['Two-file CSS folder plan', '2', '2', '2', '4', '2', '0', '0'],
  ['Two-file CSS folder write', '2', '2', '2', '4', '2', '0', '3'],
  ['Unchanged Tailwind rerun', '1', '1', '1', '1', '1', '0', '0'],
  ['Unchanged CSS folder rerun', '2', '4', '2', '4', '2', '1', '0'],
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
      ['Relative, built-in, and external module edges', '245'],
      ['Known policy owners', '6'],
    ]);
    expect(tableRows(markdown, 'Largest production modules')).toEqual(largestProductionModules);
    expect(tableRows(markdown, 'Runtime dependencies').map(row => row.slice(0, 3))).toEqual([
      ['@angular/compiler', 'declared, used', 'Angular template parsing'],
      ['commander', 'declared, used', 'CLI command and option parsing'],
      ['fs-extra', 'declared, used', 'Filesystem traversal and copy helpers'],
      ['ignore', 'undeclared, used', 'Gitignore-compatible path filtering'],
      ['winston', 'declared, used', 'Application logging'],
    ]);
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
    expect(markdown).toContain('Warm-up runs per scenario: **1**');
    expect(markdown).toContain('Recorded samples per scenario: **5**');
    expect(tableRows(markdown, 'Workload counters')).toEqual(workloadRows);
  });

  test('never makes a machine-specific wall-clock observation a CI threshold', async () => {
    const markdown = await readFile(baselineUrl, 'utf8');
    const sentences = markdown.match(/[^.!?\n]+[.!?]?/gu) ?? [];
    const wallClockThresholdSentences = sentences.filter(
      sentence =>
        /\b\d+(?:\.\d+)?\s*(?:ms|milliseconds?|seconds?)\b/iu.test(sentence) &&
        /\b(?:CI|threshold|gate|fail(?:ed|s|ure)?)\b/iu.test(sentence),
    );

    expect(wallClockThresholdSentences).toEqual([]);
  });
});
