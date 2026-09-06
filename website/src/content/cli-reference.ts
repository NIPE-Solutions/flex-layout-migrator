import { deepFreeze, type DocumentationEvidencePath } from './public-contract';

export interface CliOptionReference {
  readonly longFlag: string;
  readonly shortFlag?: string;
  readonly valueName?: string;
  readonly description: string;
  readonly defaultValue?: string | boolean;
  readonly choices?: readonly string[];
  readonly interaction?: string;
  readonly evidence: readonly DocumentationEvidencePath[];
}

export const cliReference = deepFreeze([
  {
    longFlag: '--config',
    valueName: 'path',
    description: 'declarative migration JSON configuration',
    evidence: ['src/cli/run-cli.ts', 'src/cli/target-config-cli.spec.ts'],
  },
  {
    longFlag: '--tailwind-stylesheet',
    valueName: 'path',
    description: 'statically analyze a Tailwind v4 target stylesheet',
    evidence: ['src/cli/run-cli.ts', 'src/cli/target-config-cli.spec.ts'],
  },
  {
    longFlag: '--tailwind-prefix',
    valueName: 'prefix',
    description: 'override Tailwind v4 prefix; empty string means none',
    evidence: ['src/cli/run-cli.ts', 'src/cli/target-config-cli.spec.ts'],
  },
  {
    longFlag: '--plan',
    description: 'explicitly request the default review-only plan',
    evidence: ['src/cli/run-cli.ts', 'src/cli/target-config-cli.spec.ts'],
  },

  {
    longFlag: '--output',
    shortFlag: '-o',
    valueName: 'path',
    description: 'planned output HTML file or folder; single-file output must end in .html; defaults to input',
    interaction: 'Defaults to the input path when omitted.',
    evidence: ['src/cli/run-cli.ts', 'src/cli/run-cli.spec.ts'],
  },
  {
    longFlag: '--target',
    shortFlag: '-t',
    valueName: 'target',
    description: 'conversion target; css requires --stylesheet',
    defaultValue: 'tailwind',
    choices: ['tailwind', 'css'],
    interaction: 'The css target requires exactly one --stylesheet path.',
    evidence: ['src/cli/run-cli.ts', 'src/cli/run-cli.spec.ts'],
  },
  {
    longFlag: '--stylesheet',
    valueName: 'path',
    description: 'companion stylesheet; required when --target css',
    interaction: 'May be specified once and is required only for the css target.',
    evidence: ['src/cli/run-cli.ts', 'src/cli/run-cli.spec.ts'],
  },
  {
    longFlag: '--write',
    description: 'apply the validated migration plan',
    defaultValue: false,
    interaction: 'Without this flag the command plans changes and does not apply template or stylesheet writes.',
    evidence: ['src/cli/run-cli.ts', 'src/cli/run-cli.spec.ts'],
  },
  {
    longFlag: '--report',
    valueName: 'path',
    description: 'atomically write a JSON report; path must end in .json',
    interaction: 'Report output is an intentional filesystem side effect in both plan and write modes.',
    evidence: ['src/cli/run-cli.ts', 'src/cli/run-cli.spec.ts'],
  },
  {
    longFlag: '--allow-unresolved',
    description: 'return success when unresolved inputs remain',
    defaultValue: false,
    interaction: 'Changes only the final exit code; diagnostics and migration output remain unchanged.',
    evidence: ['src/cli/run-cli.ts', 'src/cli/run-cli.spec.ts'],
  },
  {
    longFlag: '--orientation-breakpoints',
    description: 'confirm the source enables the archived orientation breakpoints',
    defaultValue: false,
    interaction: 'This is an explicit source-configuration assertion, not breakpoint discovery.',
    evidence: ['src/cli/run-cli.ts', 'src/cli/run-cli.spec.ts'],
  },
  {
    longFlag: '--responsive-images',
    description: 'wrap eligible responsive images in picture elements; acknowledges selector and layout risk',
    defaultValue: false,
    interaction: 'Opt-in behavior independent of the selected layout target.',
    evidence: ['src/cli/run-cli.ts', 'src/cli/run-cli.spec.ts'],
  },
  {
    longFlag: '--print-with-breakpoints',
    valueName: 'aliases',
    description: 'confirm the source printWithBreakpoints list; comma-separated aliases or none',
    interaction: 'Accepts a comma-separated alias list or the literal value none.',
    evidence: ['src/cli/run-cli.ts', 'src/cli/run-cli.spec.ts'],
  },
  {
    longFlag: '--debug',
    shortFlag: '-d',
    description: 'enable debug logging',
    defaultValue: false,
    evidence: ['src/cli/run-cli.ts'],
  },
  {
    longFlag: '--version',
    shortFlag: '-V',
    description: 'output the version number',
    evidence: ['src/cli/run-cli.ts', 'package.json'],
  },
] as const satisfies readonly CliOptionReference[]);
