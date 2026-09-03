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
  return Object.freeze({
    inputPath: invocation.inputPath,
    outputPath: invocation.outputPath,
    canonicalInputPath: normalizedAbsolutePath(invocation.inputPath),
    canonicalOutputPath: normalizedAbsolutePath(invocation.outputPath),
    options: Object.freeze({ ...invocation.options }),
  });
}

export function projectManifest(
  manifest: Omit<ProjectManifest, 'invocation'> & { readonly invocation: MigrationInvocationInput },
): ProjectManifest {
  return Object.freeze({
    invocation: migrationInvocation(manifest.invocation),
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

function normalizedAbsolutePath(value: string): string {
  return path.normalize(path.resolve(value));
}
