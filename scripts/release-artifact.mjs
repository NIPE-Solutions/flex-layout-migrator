import { execFile } from 'node:child_process';
import console from 'node:console';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const expectedPackageFiles = Object.freeze([
  'CHANGELOG.md',
  'LICENSE',
  'README.md',
  'dist/cli.js',
  'dist/cli.js.map',
  'package.json',
]);

export function validateReleaseVersion(version) {
  if (!/^2\.0\.0-beta\.[1-9]\d*$/.test(version)) {
    throw new Error(`Release version boundary rejected unsupported version: ${version}`);
  }
}

export async function registryVersionExists({ name, version, fetchImpl }) {
  const registryUrl = `https://registry.npmjs.org/${encodeURIComponent(name)}/${encodeURIComponent(version)}`;
  let response;
  try {
    response = await fetchImpl(registryUrl);
  } catch (error) {
    throw new Error('Registry uniqueness boundary request failed', { cause: error });
  }

  if (response.status === 200) return true;
  if (response.status === 404) return false;

  throw new Error(`Registry uniqueness boundary returned unexpected HTTP status ${response.status}`);
}

export function inspectPackManifest({ repositoryManifest, packManifest }) {
  if (!packManifest || typeof packManifest !== 'object') {
    throw new Error('Pack manifest boundary requires exactly one npm pack descriptor');
  }

  if (packManifest.name !== repositoryManifest.name) {
    throw new Error(
      `Package identity boundary mismatch: expected ${repositoryManifest.name}; received ${packManifest.name}`,
    );
  }

  if (packManifest.version !== repositoryManifest.version) {
    throw new Error(
      `Package version boundary mismatch: expected ${repositoryManifest.version}; received ${packManifest.version}`,
    );
  }

  const actualPackageFiles = Array.isArray(packManifest.files) ? packManifest.files.map(file => file.path).sort() : [];
  const missingFiles = expectedPackageFiles.filter(path => !actualPackageFiles.includes(path));
  const unexpectedFiles = actualPackageFiles.filter(path => !expectedPackageFiles.includes(path));
  const duplicateFiles = [
    ...new Set(actualPackageFiles.filter((path, index) => actualPackageFiles.indexOf(path) !== index)),
  ];
  if (missingFiles.length > 0 || unexpectedFiles.length > 0 || duplicateFiles.length > 0) {
    throw new Error(
      `Package file surface boundary mismatch: missing [${missingFiles.join(', ')}]; unexpected [${unexpectedFiles.join(', ')}]; duplicate [${duplicateFiles.join(', ')}]`,
    );
  }

  const expectedFilename = `${repositoryManifest.name.replace(/^@/, '').replace('/', '-')}-${repositoryManifest.version}.tgz`;
  if (packManifest.filename !== expectedFilename) {
    throw new Error(
      `Tarball filename boundary mismatch: expected ${expectedFilename}; received ${packManifest.filename}`,
    );
  }

  if (typeof packManifest.integrity !== 'string' || !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(packManifest.integrity)) {
    throw new Error('Package integrity boundary requires SHA-512 npm pack integrity');
  }

  return Object.freeze({
    name: packManifest.name,
    version: packManifest.version,
    tarball: packManifest.filename,
    integrity: packManifest.integrity,
  });
}

function githubOutputPath(args) {
  const optionIndex = args.indexOf('--github-output');
  const outputPath = args[optionIndex + 1];
  if (optionIndex === -1 || !outputPath || outputPath.startsWith('--')) {
    throw new Error('GitHub output boundary requires --github-output <path>');
  }
  return outputPath;
}

export async function runReleaseArtifact({ args, env, repository, fetchImpl, execFileImpl } = {}) {
  const effectiveArgs = args ?? process.argv.slice(2);
  const effectiveEnv = env ?? process.env;
  const effectiveRepository = repository ?? resolve(import.meta.dirname, '..');
  const effectiveFetch = fetchImpl ?? globalThis.fetch;
  const effectiveExecFile = execFileImpl ?? execFileAsync;

  if (effectiveEnv.GITHUB_REF_NAME !== 'main') {
    throw new Error(
      `Protected branch boundary requires GITHUB_REF_NAME=main; received ${effectiveEnv.GITHUB_REF_NAME ?? '<unset>'}`,
    );
  }

  const outputPath = githubOutputPath(effectiveArgs);
  const repositoryManifest = JSON.parse(await readFile(join(effectiveRepository, 'package.json'), 'utf8'));
  validateReleaseVersion(repositoryManifest.version);

  if (
    await registryVersionExists({
      name: repositoryManifest.name,
      version: repositoryManifest.version,
      fetchImpl: effectiveFetch,
    })
  ) {
    throw new Error(
      `Registry uniqueness boundary rejected ${repositoryManifest.name}@${repositoryManifest.version}: version already exists`,
    );
  }

  const packed = await effectiveExecFile('npm', ['pack', '--json', '--ignore-scripts'], {
    cwd: effectiveRepository,
  });
  let descriptors;
  try {
    descriptors = JSON.parse(packed.stdout);
  } catch (error) {
    throw new Error('Pack manifest boundary received invalid npm pack JSON', { cause: error });
  }
  if (!Array.isArray(descriptors) || descriptors.length !== 1) {
    throw new Error(
      `Pack manifest boundary requires exactly one npm pack descriptor; received ${Array.isArray(descriptors) ? descriptors.length : 'non-array output'}`,
    );
  }

  const artifact = inspectPackManifest({
    repositoryManifest,
    packManifest: descriptors[0],
  });
  await writeFile(join(effectiveRepository, 'release-artifact.json'), `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  await appendFile(
    outputPath,
    [
      `tarball=${artifact.tarball}`,
      `name=${artifact.name}`,
      `version=${artifact.version}`,
      `integrity=${artifact.integrity}`,
      '',
    ].join('\n'),
    'utf8',
  );

  return artifact;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) {
  runReleaseArtifact().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
