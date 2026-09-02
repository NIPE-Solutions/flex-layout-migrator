import { lstat, readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { allBreakpointDefinitions } from '../breakpoint/breakpoint-catalog';
import { cssRuleContext } from '../adapter/css/css-breakpoint.context';
import type { OwnedCssRule } from '../adapter/css/css-artifact.model';
import { CssStylesheetError } from '../adapter/css/stylesheet/css-stylesheet.error';
import {
  mergeOwnedStylesheet,
  type OwnedCssReferences,
  type RetainedMediaContextResolver,
} from '../adapter/css/stylesheet/owned-stylesheet.merger';
import { serializeCssMedia } from '../adapter/css/stylesheet/css-media.serializer';
import { MigrationApplicationError } from './migration-application.error';
import { plannedOutputArtifact, type ArtifactState, type PlannedOutputArtifact } from './migration-plan';

interface StylesheetPlannerFileSystem {
  readonly readFile: (path: string) => Promise<string>;
  readonly lstat: (path: string) => ReturnType<typeof lstat>;
}

const nodeFileSystem: StylesheetPlannerFileSystem = {
  readFile: target => readFile(target, 'utf8'),
  lstat,
};

const retainedMediaContexts = new Map(
  allBreakpointDefinitions().map(definition => [serializeCssMedia(definition.media), cssRuleContext(definition)]),
);

const resolveRetainedMediaContext: RetainedMediaContextResolver = media => retainedMediaContexts.get(media);

export class StylesheetPlanner {
  constructor(private readonly fileSystem: StylesheetPlannerFileSystem = nodeFileSystem) {}

  async plan(
    stylesheetPath: string,
    rules: readonly OwnedCssRule[],
    references: ReadonlySet<string> | OwnedCssReferences = new Set(rules.map(rule => rule.className)),
  ): Promise<PlannedOutputArtifact | undefined> {
    const outputPath = path.resolve(stylesheetPath);
    const original = await this.originalState(outputPath);
    const existing = original.status === 'present' ? original.contents : '';

    let merged: ReturnType<typeof mergeOwnedStylesheet>;
    try {
      merged = mergeOwnedStylesheet(existing, rules, references, resolveRetainedMediaContext);
    } catch (error: unknown) {
      if (error instanceof CssStylesheetError) {
        throw new MigrationApplicationError(
          'stylesheet-ownership-invalid',
          `Cannot safely update stylesheet ownership: ${outputPath}`,
          [outputPath],
          { cause: error },
        );
      }
      throw error;
    }

    const proposed = proposedState(original, merged.changed, merged.output);
    if (sameState(original, proposed)) return undefined;

    return plannedOutputArtifact({ kind: 'stylesheet', path: outputPath, original, proposed });
  }

  private async originalState(outputPath: string): Promise<ArtifactState> {
    let stat: Awaited<ReturnType<typeof lstat>>;
    try {
      stat = await this.fileSystem.lstat(outputPath);
    } catch (error: unknown) {
      if (isEnoent(error)) return { status: 'absent' };
      throw error;
    }

    if (stat.isSymbolicLink()) {
      throw new MigrationApplicationError(
        'unsupported-path-type',
        `Stylesheet path must not be a symbolic link: ${outputPath}`,
        [outputPath],
      );
    }
    if (!stat.isFile()) {
      throw new MigrationApplicationError(
        'unsupported-path-type',
        `Stylesheet path must be a regular file: ${outputPath}`,
        [outputPath],
      );
    }

    return { status: 'present', contents: await this.fileSystem.readFile(outputPath) };
  }
}

function proposedState(original: ArtifactState, changed: boolean, output: string): ArtifactState {
  if (output === '' && (original.status === 'absent' || changed)) return { status: 'absent' };
  return { status: 'present', contents: output };
}

function sameState(left: ArtifactState, right: ArtifactState): boolean {
  if (left.status !== right.status) return false;
  if (left.status === 'absent') return true;
  return right.status === 'present' && left.contents === right.contents;
}

function isEnoent(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
