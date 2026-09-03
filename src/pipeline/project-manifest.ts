import * as path from 'node:path';
import type { MigrationOptions } from '../migrator/migrator';

export interface MigrationInvocation {
  readonly inputPath: string;
  readonly outputPath: string;
  readonly options: Readonly<MigrationOptions>;
}

export interface ManifestTemplate {
  readonly inputPath: string;
  readonly outputPath: string;
}

export interface ProjectManifest {
  readonly invocation: MigrationInvocation;
  readonly templates: readonly ManifestTemplate[];
}

export function migrationInvocation(invocation: MigrationInvocation): MigrationInvocation {
  return Object.freeze({
    inputPath: normalizedAbsolutePath(invocation.inputPath),
    outputPath: normalizedAbsolutePath(invocation.outputPath),
    options: Object.freeze({ ...invocation.options }),
  });
}

export function projectManifest(manifest: ProjectManifest): ProjectManifest {
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
