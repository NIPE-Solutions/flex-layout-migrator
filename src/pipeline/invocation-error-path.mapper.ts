import * as path from 'node:path';
import type { MigrationInvocation } from './project-manifest';

interface InvocationPathRoot {
  readonly canonical: string;
  readonly raw: string;
}

type PathBearingError = Error & {
  path?: unknown;
  dest?: unknown;
};

export function remapInvocationErrorPaths(error: unknown, invocation: MigrationInvocation): unknown {
  if (!(error instanceof Error)) return error;

  const roots = invocationRoots(invocation);
  const pathBearingError = error as PathBearingError;
  remapErrorPath(pathBearingError, 'path', roots);
  remapErrorPath(pathBearingError, 'dest', roots);
  return error;
}

function invocationRoots(invocation: MigrationInvocation): readonly InvocationPathRoot[] {
  return [
    { canonical: invocation.canonicalInputPath, raw: invocation.inputPath },
    { canonical: invocation.canonicalOutputPath, raw: invocation.outputPath },
  ].sort((left, right) => right.canonical.length - left.canonical.length);
}

function remapErrorPath(error: PathBearingError, field: 'path' | 'dest', roots: readonly InvocationPathRoot[]): void {
  const original = error[field];
  if (typeof original !== 'string') return;

  const mapped = mappedInvocationPath(original, roots);
  if (mapped === original) return;

  error.message = error.message.replaceAll(original, () => mapped);
  error[field] = mapped;
}

function mappedInvocationPath(candidate: string, roots: readonly InvocationPathRoot[]): string {
  if (!path.isAbsolute(candidate)) return candidate;

  for (const root of roots) {
    const relativePath = path.relative(root.canonical, candidate);
    if (relativePath === '') return root.raw;
    if (relativePath === '..' || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) continue;
    return path.join(root.raw, relativePath);
  }

  return candidate;
}
