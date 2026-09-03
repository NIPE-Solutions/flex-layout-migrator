import * as path from 'node:path';
import type { MigrationOptions } from '../migrator/migrator';

export interface MigrationInvocation {
  readonly inputPath: string;
  readonly outputPath: string;
  readonly canonicalInputPath: string;
  readonly canonicalOutputPath: string;
  readonly options: Readonly<MigrationOptions>;
}

type MigrationInvocationInput = Pick<MigrationInvocation, 'inputPath' | 'outputPath' | 'options'>;

export interface ManifestTemplate {
  readonly inputPath: string;
  readonly outputPath: string;
}

export interface ProjectManifest {
  readonly invocation: MigrationInvocation;
  readonly templates: readonly ManifestTemplate[];
}

export function migrationInvocation(invocation: MigrationInvocationInput): MigrationInvocation {
  return freezeMigrationInvocation({
    inputPath: invocation.inputPath,
    outputPath: invocation.outputPath,
    canonicalInputPath: normalizedAbsolutePath(invocation.inputPath),
    canonicalOutputPath: normalizedAbsolutePath(invocation.outputPath),
    options: invocation.options,
  });
}

export function projectManifest(
  manifest: Omit<ProjectManifest, 'invocation'> & {
    readonly invocation: MigrationInvocationInput | MigrationInvocation;
  },
): ProjectManifest {
  return Object.freeze({
    invocation: hasCanonicalIdentity(manifest.invocation)
      ? freezeMigrationInvocation(manifest.invocation)
      : migrationInvocation(manifest.invocation),
    templates: Object.freeze(
      manifest.templates.map(template =>
        Object.freeze({
          inputPath: normalizedAbsolutePath(template.inputPath),
          outputPath: normalizedAbsolutePath(template.outputPath),
        }),
      ),
    ),
  });
}

function hasCanonicalIdentity(
  invocation: MigrationInvocationInput | MigrationInvocation,
): invocation is MigrationInvocation {
  return 'canonicalInputPath' in invocation && 'canonicalOutputPath' in invocation;
}

function freezeMigrationInvocation(invocation: MigrationInvocation): MigrationInvocation {
  return Object.freeze({
    inputPath: invocation.inputPath,
    outputPath: invocation.outputPath,
    canonicalInputPath: invocation.canonicalInputPath,
    canonicalOutputPath: invocation.canonicalOutputPath,
    options: Object.freeze({ ...invocation.options }),
  });
}

function normalizedAbsolutePath(value: string): string {
  return path.normalize(path.resolve(value));
}
