import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { describe, expect, it, vi } from 'vitest';

import {
  architectureTestBenchmark,
  benchmarkScenarios,
  median,
  medianAbsoluteDeviation,
  runBenchmark,
  summarize,
} from './architecture-benchmark.mjs';

describe('architecture benchmark statistics', () => {
  it('calculates medians without changing input order', () => {
    const values = [9, 1, 5, 3];

    expect(median(values)).toBe(4);
    expect(values).toEqual([9, 1, 5, 3]);
  });

  it('calculates median absolute deviation from the sample median', () => {
    expect(medianAbsoluteDeviation([1, 1, 2, 2, 4, 6, 9])).toBe(1);
  });

  it('summarizes elapsed time and preserves recorded RSS values', () => {
    expect(
      summarize([
        { milliseconds: 7, peakRssBytes: 700 },
        { milliseconds: 1, peakRssBytes: 100 },
        { milliseconds: 4, peakRssBytes: 400 },
      ]),
    ).toEqual({
      milliseconds: [7, 1, 4],
      medianMilliseconds: 4,
      minMilliseconds: 1,
      maxMilliseconds: 7,
      medianAbsoluteDeviationMilliseconds: 3,
      peakRssBytes: [700, 100, 400],
    });
  });
});

describe('architecture benchmark memory probe', () => {
  it.each(['darwin', 'linux'])('records max RSS in bytes on %s', async platform => {
    const directory = await mkdtemp(join(tmpdir(), 'architecture-memory-probe-'));
    const metricsPath = join(directory, 'metrics.json');
    const probeUrl = new URL('./memory-probe.mjs', import.meta.url).href;
    const program = `
      Object.defineProperty(process, 'platform', { value: ${JSON.stringify(platform)} });
      process.resourceUsage = () => ({ maxRSS: 123 });
      await import(${JSON.stringify(probeUrl)});
    `;

    try {
      const result = spawnSync(process.execPath, ['--input-type=module', '--eval', program], {
        encoding: 'utf8',
        env: { ...process.env, FLEX_LAYOUT_BENCHMARK_METRICS_PATH: metricsPath },
      });

      expect(result).toMatchObject({ status: 0, stdout: '', stderr: '' });
      expect(JSON.parse(await readFile(metricsPath, 'utf8'))).toEqual({ peakRssBytes: 123 * 1024 });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe('runBenchmark', () => {
  it('keeps four product scenarios and records architecture tests separately after one warm-up', async () => {
    const runProcess = vi.fn((command: string, arguments_: readonly string[], options: { env: NodeJS.ProcessEnv }) => {
      expect(command).toBe(process.execPath);
      if (arguments_[0] === '--import') {
        expect(arguments_[1]).toMatch(/scripts[/\\]benchmark[/\\]memory-probe\.mjs$/u);
        expect(arguments_[2]).toMatch(/dist[/\\]cli\.js$/u);
        expect(arguments_.slice(3).some(argument => existsSync(argument))).toBe(true);
        expect(options.env.FLEX_LAYOUT_BENCHMARK_METRICS_PATH).toBeTruthy();
      } else {
        expect(arguments_[0]).toMatch(/node_modules[/\\]vitest[/\\]vitest\.mjs$/u);
        expect(arguments_[1]).toBe('run');
        expect(arguments_[2]).toMatch(/test[/\\]architecture[/\\]enterprise-pipeline-boundary\.test\.ts$/u);
        expect(options.env.FLEX_LAYOUT_BENCHMARK_METRICS_PATH).toBeUndefined();
      }
      return { status: 0, stdout: '', stderr: '' };
    });
    const durations = [...Array.from({ length: 4 }, () => [1_000, 1, 2, 3, 4, 5]).flat(), 9_000, 10, 20, 30, 40, 50];
    let clockCall = 0;
    const now = vi.fn(() => {
      const duration = durations[Math.floor(clockCall / 2)];
      const value = clockCall % 2 === 0 ? 0 : duration;
      clockCall += 1;
      return value;
    });
    const rss = Array.from({ length: 4 }, () => [999, 10, 20, 30, 40, 50]).flat();
    const readPeakRss = vi.fn(async () => rss.shift());

    const report = await runBenchmark({
      warmups: 1,
      samples: 5,
      runProcess,
      now,
      readPeakRss,
      commit: 'abc123',
      scenarioDefinitions: [...benchmarkScenarios].reverse(),
    });

    expect(runProcess).toHaveBeenCalledTimes(30);
    const invocations = runProcess.mock.calls.map(([, arguments_, options]) => ({
      commandLine: arguments_.join(' '),
      metricsPath: options.env.FLEX_LAYOUT_BENCHMARK_METRICS_PATH,
    }));
    for (const name of ['single-tailwind-plan', 'multi-tailwind-plan', 'multi-native-css-plan', 'unchanged-write']) {
      expect(invocations.filter(invocation => invocation.commandLine.includes(name))).toHaveLength(6);
    }
    const productInvocations = invocations.filter(invocation => invocation.metricsPath !== undefined);
    const architectureInvocations = invocations.filter(invocation => invocation.metricsPath === undefined);
    expect(new Set(productInvocations.map(invocation => invocation.metricsPath)).size).toBe(24);
    expect(architectureInvocations).toHaveLength(6);
    expect(report).toMatchObject({ warmups: 1, samples: 5, commit: 'abc123' });
    expect(report.scenarios.map(scenario => scenario.name)).toEqual([
      'single-tailwind-plan',
      'multi-tailwind-plan',
      'multi-native-css-plan',
      'unchanged-write',
    ]);
    for (const scenario of report.scenarios) {
      expect(scenario).toMatchObject({
        milliseconds: [1, 2, 3, 4, 5],
        medianMilliseconds: 3,
        minMilliseconds: 1,
        maxMilliseconds: 5,
        medianAbsoluteDeviationMilliseconds: 1,
        peakRssBytes: [10, 20, 30, 40, 50],
      });
    }
    expect(report.architectureTest).toEqual({
      command: architectureTestBenchmark.command,
      milliseconds: [10, 20, 30, 40, 50],
      medianMilliseconds: 30,
      minMilliseconds: 10,
      maxMilliseconds: 50,
      medianAbsoluteDeviationMilliseconds: 10,
    });
  });

  it('rejects a nonzero packaged CLI exit', async () => {
    await expect(
      runBenchmark({
        warmups: 1,
        samples: 5,
        runProcess: () => ({ status: 2, stdout: 'partial output', stderr: 'migration failed' }),
        now: () => 0,
        readPeakRss: async () => 1,
        commit: 'abc123',
      }),
    ).rejects.toThrow(/single-tailwind-plan.*status 2.*migration failed/isu);
  });

  it('rejects a nonzero architecture-test exit without applying a timing threshold', async () => {
    await expect(
      runBenchmark({
        warmups: 0,
        samples: 1,
        scenarioDefinitions: [],
        runProcess: () => ({ status: 1, stdout: '', stderr: 'architecture assertion failed' }),
        now: () => 60_000,
        readPeakRss: async () => 1,
        commit: 'abc123',
      }),
    ).rejects.toThrow(/architecture test.*status 1.*architecture assertion failed/isu);
  });
});
