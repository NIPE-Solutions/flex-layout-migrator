import { Buffer } from 'node:buffer';
import { execFile } from 'node:child_process';
import console from 'node:console';
import { appendFile, lstat, readFile, rm, writeFile } from 'node:fs/promises';
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

function isCanonicalSha512Integrity(integrity) {
  if (typeof integrity !== 'string') return false;
  const match = /^sha512-([A-Za-z0-9+/]+={0,2})$/.exec(integrity);
  if (!match) return false;

  const encodedDigest = match[1];
  const digest = Buffer.from(encodedDigest, 'base64');
  return digest.length === 64 && digest.toString('base64') === encodedDigest;
}

function tarballFilename({ name, version }) {
  return `${name.replace(/^@/, '').replace('/', '-')}-${version}.tgz`;
}

async function requireInvocationOwnedPaths(paths) {
  for (const [label, path] of paths) {
    try {
      await lstat(path);
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') continue;
      throw new Error(`Release artifact ownership boundary could not inspect ${label}`, { cause: error });
    }
    throw new Error(`Release artifact ownership boundary refuses preexisting ${label}: ${path}`);
  }
}

async function cleanupInvocationArtifacts(paths, rmImpl) {
  const failures = [];
  for (const path of paths) {
    try {
      await rmImpl(path, { force: true });
    } catch (error) {
      failures.push(error);
    }
  }

  if (failures.length > 0) {
    const cause =
      failures.length === 1 ? failures[0] : new AggregateError(failures, 'Multiple release artifact cleanup failures');
    throw new Error('Release artifact cleanup boundary failed', { cause });
  }
}

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

  const expectedFilename = tarballFilename(repositoryManifest);
  if (packManifest.filename !== expectedFilename) {
    throw new Error(
      `Tarball filename boundary mismatch: expected ${expectedFilename}; received ${packManifest.filename}`,
    );
  }

  if (!isCanonicalSha512Integrity(packManifest.integrity)) {
    throw new Error('Package integrity boundary requires canonical 64-byte SHA-512 SRI');
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

export async function runReleaseArtifact({
  args,
  env,
  repository,
  fetchImpl,
  execFileImpl,
  writeFileImpl,
  appendFileImpl,
  rmImpl,
} = {}) {
  const effectiveArgs = args ?? process.argv.slice(2);
  const effectiveEnv = env ?? process.env;
  const effectiveRepository = repository ?? resolve(import.meta.dirname, '..');
  const effectiveFetch = fetchImpl ?? globalThis.fetch;
  const effectiveExecFile = execFileImpl ?? execFileAsync;
  const effectiveWriteFile = writeFileImpl ?? writeFile;
  const effectiveAppendFile = appendFileImpl ?? appendFile;
  const effectiveRm = rmImpl ?? rm;

  if (effectiveEnv.GITHUB_REF_NAME !== 'main') {
    throw new Error(
      `Protected branch boundary requires GITHUB_REF_NAME=main; received ${effectiveEnv.GITHUB_REF_NAME ?? '<unset>'}`,
    );
  }

  const outputPath = githubOutputPath(effectiveArgs);
  let manifestSource;
  try {
    manifestSource = await readFile(join(effectiveRepository, 'package.json'), 'utf8');
  } catch (error) {
    throw new Error('Repository manifest release boundary read failed', { cause: error });
  }

  let repositoryManifest;
  try {
    repositoryManifest = JSON.parse(manifestSource);
  } catch (error) {
    throw new Error('Repository manifest release boundary parse failed', { cause: error });
  }
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

  const tarballPath = join(effectiveRepository, tarballFilename(repositoryManifest));
  const metadataPath = join(effectiveRepository, 'release-artifact.json');
  await requireInvocationOwnedPaths([
    ['tarball', tarballPath],
    ['release metadata', metadataPath],
  ]);

  try {
    let packed;
    try {
      packed = await effectiveExecFile('npm', ['pack', '--json', '--ignore-scripts'], {
        cwd: effectiveRepository,
      });
    } catch (error) {
      throw new Error('Pack process release boundary failed', { cause: error });
    }

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
    try {
      await effectiveWriteFile(metadataPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
    } catch (error) {
      throw new Error('Release metadata boundary write failed', { cause: error });
    }

    try {
      await effectiveAppendFile(
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
    } catch (error) {
      throw new Error('GitHub output release boundary append failed', { cause: error });
    }

    return artifact;
  } catch (error) {
    await cleanupInvocationArtifacts([tarballPath, metadataPath], effectiveRm);
    throw error;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) {
  runReleaseArtifact().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
