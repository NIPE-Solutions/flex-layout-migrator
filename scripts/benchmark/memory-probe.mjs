import { writeFileSync } from 'node:fs';
import process from 'node:process';

const metricsPath = process.env.FLEX_LAYOUT_BENCHMARK_METRICS_PATH;
if (!metricsPath) throw new Error('FLEX_LAYOUT_BENCHMARK_METRICS_PATH is required');

process.on('exit', () => {
  const platformMultiplier = process.platform === 'darwin' ? 1 : 1024;
  writeFileSync(
    metricsPath,
    `${JSON.stringify({ peakRssBytes: process.resourceUsage().maxRSS * platformMultiplier })}\n`,
    'utf8',
  );
});
