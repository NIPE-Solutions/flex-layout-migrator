import { runCli } from './cli/run-cli';
import { getErrorMessage } from './util/error.util';

async function main(): Promise<void> {
  process.exitCode = await runCli(process.argv);
}

void main().catch((error: unknown) => {
  process.stderr.write(`Error: ${getErrorMessage(error)}\n`);
  process.exitCode = 1;
});
