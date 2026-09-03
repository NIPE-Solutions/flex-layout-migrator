import { readdir, stat } from 'node:fs/promises';
import * as path from 'node:path';
import { createGitIgnoreMatcher } from '../../lib/gitignore.helper';
import { compareCodeUnits } from '../../util/compare-code-units';
import type { DiscoverStage } from '../migration-pipeline';
import {
  projectManifest,
  type ManifestTemplate,
  type MigrationInvocation,
  type ProjectManifest,
} from '../project-manifest';
import type { DiscoveryEntry, DiscoveryFileSystem } from './discovery-file-system.port';
import type { IgnoreMatcher, IgnoreMatcherFactory } from './ignore-matcher.port';

const nodeFileSystem: DiscoveryFileSystem = Object.freeze({
  async kind(candidate: string) {
    const candidateStat = await stat(candidate);
    if (candidateStat.isFile()) return 'file';
    if (candidateStat.isDirectory()) return 'directory';
    return 'other';
  },
  async entries(directory: string) {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries.map((entry): DiscoveryEntry => ({
      name: entry.name,
      kind: entry.isFile() ? 'file' : entry.isDirectory() ? 'directory' : 'other',
    }));
  },
});

const gitIgnoreMatcherFactory: IgnoreMatcherFactory = Object.freeze({
  load: createGitIgnoreMatcher,
});

export class DiscoverProjectStage implements DiscoverStage {
  constructor(
    private readonly fileSystem: DiscoveryFileSystem = nodeFileSystem,
    private readonly ignoreMatchers: IgnoreMatcherFactory = gitIgnoreMatcherFactory,
  ) {}

  public async run(invocation: MigrationInvocation): Promise<ProjectManifest> {
    const inputKind = await this.fileSystem.kind(invocation.canonicalInputPath);
    let templates: readonly ManifestTemplate[];

    if (inputKind === 'file') {
      templates = this.singleFile(invocation);
    } else if (inputKind === 'directory') {
      templates = await this.folderTemplates(invocation);
    } else {
      throw new Error(`Unsupported input type: ${invocation.inputPath}`);
    }

    return projectManifest({ invocation, templates });
  }

  private singleFile(invocation: MigrationInvocation): readonly ManifestTemplate[] {
    if (path.extname(invocation.canonicalInputPath).toLowerCase() !== '.html') {
      throw new Error(`Unsupported file type: ${invocation.inputPath}`);
    }
    if (path.extname(invocation.canonicalOutputPath).toLowerCase() !== '.html') {
      throw new Error('Single-file output path must have a .html extension.');
    }
    return [{ inputPath: invocation.canonicalInputPath, outputPath: invocation.canonicalOutputPath }];
  }

  private async folderTemplates(invocation: MigrationInvocation): Promise<readonly ManifestTemplate[]> {
    const root = invocation.canonicalInputPath;
    const matcher = await this.ignoreMatchers.load(root);
    const exclusions = this.excludedPaths(invocation);
    const inputs = await this.collectInputs(root, matcher, exclusions);
    inputs.sort(compareCodeUnits);
    return inputs.map(inputPath => ({
      inputPath,
      outputPath: path.join(invocation.canonicalOutputPath, path.relative(root, inputPath)),
    }));
  }

  private async collectInputs(
    directory: string,
    matcher: IgnoreMatcher,
    exclusions: ReadonlySet<string>,
  ): Promise<string[]> {
    const entries = [...(await this.fileSystem.entries(directory))].sort((left, right) =>
      compareCodeUnits(left.name, right.name),
    );
    const inputs: string[] = [];

    for (const entry of entries) {
      const candidate = path.join(directory, entry.name);
      const ignored = entry.kind === 'directory' ? matcher.ignoresDirectory(candidate) : matcher.ignores(candidate);
      if (ignored || exclusions.has(path.normalize(candidate))) continue;

      if (entry.kind === 'directory') {
        inputs.push(...(await this.collectInputs(candidate, matcher, exclusions)));
      } else if (entry.kind === 'file' && path.extname(entry.name).toLowerCase() === '.html') {
        inputs.push(path.normalize(path.resolve(candidate)));
      }
    }

    return inputs;
  }

  private excludedPaths(invocation: MigrationInvocation): ReadonlySet<string> {
    const candidates = [invocation.options.stylesheetPath, invocation.options.reportPath]
      .filter((candidate): candidate is string => candidate !== undefined)
      .map(candidate => path.normalize(path.resolve(candidate)));
    const outputRoot = invocation.canonicalOutputPath;
    if (path.relative(invocation.canonicalInputPath, outputRoot) !== '') candidates.push(outputRoot);
    return new Set(candidates);
  }
}
