import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repository = resolve(import.meta.dirname, '../..');
const executable = join(repository, 'dist', 'cli.js');
const memoryProbe = join(repository, 'scripts', 'benchmark', 'memory-probe.mjs');
const fixtureRoot = join(repository, 'benchmark', 'fixtures');

const declaredScenarioOrder = Object.freeze([
  'single-tailwind-plan',
  'multi-tailwind-plan',
  'multi-native-css-plan',
  'unchanged-write',
]);

const scenarios = Object.freeze([
  {
    name: 'single-tailwind-plan',
    fixture: 'single-tailwind',
    arguments: workspace => [join(workspace, 'card.component.html')],
  },
  {
    name: 'multi-tailwind-plan',
    fixture: 'multi-tailwind',
    arguments: workspace => [workspace, '--orientation-breakpoints', '--print-with-breakpoints', 'md'],
  },
  {
    name: 'multi-native-css-plan',
    fixture: 'multi-native-css',
    arguments: workspace => [
      workspace,
      '--target',
      'css',
      '--stylesheet',
      join(workspace, 'flex-layout-migration.css'),
    ],
  },
  {
    name: 'unchanged-write',
    fixture: 'unchanged-write',
    arguments: workspace => [join(workspace, 'card.component.html'), '--write'],
  },
]);

export const benchmarkScenarios = scenarios;

function requireValues(values, label) {
  if (values.length === 0) throw new Error(`${label} requires at least one value`);
  if (values.some(value => !Number.isFinite(value))) throw new Error(`${label} requires finite numbers`);
}

export function median(values) {
  requireValues(values, 'median');
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

export function medianAbsoluteDeviation(values) {
  const sampleMedian = median(values);
  return median(values.map(value => Math.abs(value - sampleMedian)));
}

export function summarize(samples) {
  if (samples.length === 0) throw new Error('summarize requires at least one sample');
  const milliseconds = samples.map(sample => sample.milliseconds);
  const peakRssBytes = samples.map(sample => sample.peakRssBytes);
  return {
    milliseconds,
    medianMilliseconds: median(milliseconds),
    minMilliseconds: Math.min(...milliseconds),
    maxMilliseconds: Math.max(...milliseconds),
    medianAbsoluteDeviationMilliseconds: medianAbsoluteDeviation(milliseconds),
    peakRssBytes,
  };
}

function defaultRunProcess(command, arguments_, options) {
  return spawnSync(command, arguments_, { ...options, encoding: 'utf8' });
}

async function defaultReadPeakRss(metricsPath) {
  const metrics = JSON.parse(await readFile(metricsPath, 'utf8'));
  if (!Number.isFinite(metrics.peakRssBytes) || metrics.peakRssBytes < 0) {
    throw new Error(`Benchmark memory probe returned invalid peak RSS: ${metrics.peakRssBytes}`);
  }
  return metrics.peakRssBytes;
}

function currentCommit() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`Could not resolve benchmark commit: ${result.stderr?.trim() || `status ${result.status}`}`);
  }
  return result.stdout.trim();
}

function validateRunCount(value, label, allowZero) {
  if (!Number.isInteger(value) || value < (allowZero ? 0 : 1)) {
    throw new Error(`${label} must be ${allowZero ? 'a nonnegative' : 'a positive'} integer`);
  }
}

async function runScenarioSample({ scenario, runProcess, now, readPeakRss }) {
  const invocationDirectory = await mkdtemp(join(tmpdir(), `flex-layout-${scenario.name}-`));
  const workspace = join(invocationDirectory, scenario.name);
  const metricsPath = join(invocationDirectory, 'metrics.json');

  try {
    await cp(join(fixtureRoot, scenario.fixture), workspace, { recursive: true });
    const arguments_ = ['--import', memoryProbe, executable, ...scenario.arguments(workspace)];
    const startedAt = now();
    const result = runProcess(process.execPath, arguments_, {
      cwd: repository,
      env: { ...process.env, FLEX_LAYOUT_BENCHMARK_METRICS_PATH: metricsPath },
    });
    const milliseconds = now() - startedAt;
    if (result.status !== 0) {
      const details = result.stderr?.trim() || result.stdout?.trim() || 'no process output';
      throw new Error(`Benchmark scenario ${scenario.name} exited with status ${result.status}: ${details}`);
    }
    return { milliseconds, peakRssBytes: await readPeakRss(metricsPath) };
  } finally {
    await rm(invocationDirectory, { recursive: true, force: true });
  }
}

export async function runBenchmark({
  warmups = 1,
  samples = 5,
  runProcess = defaultRunProcess,
  now = () => performance.now(),
  readPeakRss = defaultReadPeakRss,
  commit = currentCommit(),
  scenarioDefinitions = benchmarkScenarios,
} = {}) {
  validateRunCount(warmups, 'warmups', true);
  validateRunCount(samples, 'samples', false);

  const order = new Map(declaredScenarioOrder.map((name, index) => [name, index]));
  const orderedScenarios = [...scenarioDefinitions].sort((left, right) => order.get(left.name) - order.get(right.name));
  const scenarioReports = [];
  for (const scenario of orderedScenarios) {
    const recorded = [];
    for (let index = 0; index < warmups + samples; index += 1) {
      const sample = await runScenarioSample({ scenario, runProcess, now, readPeakRss });
      if (index >= warmups) recorded.push(sample);
    }
    scenarioReports.push({ name: scenario.name, ...summarize(recorded) });
  }
  return {
    generatedAt: new Date().toISOString(),
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    commit,
    warmups,
    samples,
    scenarios: scenarioReports,
  };
}

function parseJsonOutputPath(arguments_) {
  if (arguments_.length !== 2 || arguments_[0] !== '--json' || !arguments_[1]) {
    throw new Error('Usage: npm run benchmark:architecture -- --json <path>');
  }
  return resolve(arguments_[1]);
}

async function main() {
  const outputPath = parseJsonOutputPath(process.argv.slice(2));
  const report = await runBenchmark();
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  process.stdout.write(`Architecture benchmark report written to ${outputPath}\n`);
}

function isDirectInvocation() {
  if (!process.argv[1]) return false;
  return resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isDirectInvocation()) {
  void main().catch(error => {
    process.stderr.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
