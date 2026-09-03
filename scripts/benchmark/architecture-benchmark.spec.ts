import { existsSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import {
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

describe('runBenchmark', () => {
  it('runs every declared scenario after one warm-up and records only five samples in declared order', async () => {
    const runProcess = vi.fn((command: string, arguments_: readonly string[], options: { env: NodeJS.ProcessEnv }) => {
      expect(command).toBe(process.execPath);
      expect(arguments_[0]).toBe('--import');
      expect(arguments_[1]).toMatch(/scripts[/\\]benchmark[/\\]memory-probe\.mjs$/u);
      expect(arguments_[2]).toMatch(/dist[/\\]cli\.js$/u);
      expect(arguments_.slice(3).some(argument => existsSync(argument))).toBe(true);
      expect(options.env.FLEX_LAYOUT_BENCHMARK_METRICS_PATH).toBeTruthy();
      return { status: 0, stdout: '', stderr: '' };
    });
    const durations = Array.from({ length: 4 }, () => [1_000, 1, 2, 3, 4, 5]).flat();
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

    expect(runProcess).toHaveBeenCalledTimes(24);
    const invocations = runProcess.mock.calls.map(([, arguments_, options]) => ({
      commandLine: arguments_.join(' '),
      metricsPath: options.env.FLEX_LAYOUT_BENCHMARK_METRICS_PATH,
    }));
    for (const name of ['single-tailwind-plan', 'multi-tailwind-plan', 'multi-native-css-plan', 'unchanged-write']) {
      expect(invocations.filter(invocation => invocation.commandLine.includes(name))).toHaveLength(6);
    }
    expect(new Set(invocations.map(invocation => invocation.metricsPath)).size).toBe(24);
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
});
