import * as path from 'node:path';
import { remapInvocationErrorPaths } from './invocation-error-path.mapper';
import { migrationInvocation } from './project-manifest';

describe('remapInvocationErrorPaths', () => {
  test('preserves an absolute invocation error byte-for-byte and by identity', () => {
    const absoluteInput = path.resolve('absolute-project/input');
    const invocation = migrationInvocation({
      inputPath: absoluteInput,
      outputPath: path.resolve('absolute-project/output'),
      options: { mode: 'plan' },
    });
    const templatePath = path.join(absoluteInput, 'card.html');
    const cause = new Error('filesystem cause');
    const error = nodeIoError(
      'EACCES',
      'open',
      templatePath,
      `EACCES: permission denied, open '${templatePath}'`,
      cause,
    );

    const result = remapInvocationErrorPaths(error, invocation);

    expect(result).toBe(error);
    expect(error.message).toBe(`EACCES: permission denied, open '${templatePath}'`);
    expect(error.path).toBe(templatePath);
    expect(error.code).toBe('EACCES');
    expect(error.cause).toBe(cause);
  });

  test('does not rewrite an error path outside the invocation roots or a sibling with a textual prefix', () => {
    const invocation = migrationInvocation({
      inputPath: 'relative-project/input',
      outputPath: 'relative-project/output',
      options: { mode: 'plan' },
    });
    const outsidePath = path.resolve('relative-project/input-backup/card.html');
    const error = nodeIoError(
      'ENOENT',
      'open',
      outsidePath,
      `ENOENT: no such file or directory, open '${outsidePath}'`,
    );

    const result = remapInvocationErrorPaths(error, invocation);

    expect(result).toBe(error);
    expect(error.message).toBe(`ENOENT: no such file or directory, open '${outsidePath}'`);
    expect(error.path).toBe(outsidePath);
  });

  test('remaps both path fields of one Node error without changing its class, code, or cause', () => {
    const invocation = migrationInvocation({
      inputPath: 'relative-project/input',
      outputPath: 'relative-$&-project/output',
      options: { mode: 'write' },
    });
    const canonicalSource = path.join(invocation.canonicalOutputPath, 'card.html.tmp');
    const canonicalDestination = path.join(invocation.canonicalOutputPath, 'card.html');
    const rawSource = path.join(invocation.outputPath, 'card.html.tmp');
    const rawDestination = path.join(invocation.outputPath, 'card.html');
    const cause = { operation: 'rename' };
    const error = Object.assign(
      new TypeError(`EACCES: permission denied, rename '${canonicalSource}' -> '${canonicalDestination}'`, { cause }),
      {
        code: 'EACCES',
        errno: -13,
        syscall: 'rename',
        path: canonicalSource,
        dest: canonicalDestination,
      },
    );

    const result = remapInvocationErrorPaths(error, invocation);

    expect(result).toBe(error);
    expect(error).toBeInstanceOf(TypeError);
    expect(error.message).toBe(`EACCES: permission denied, rename '${rawSource}' -> '${rawDestination}'`);
    expect(error.path).toBe(rawSource);
    expect(error.dest).toBe(rawDestination);
    expect(error.code).toBe('EACCES');
    expect(error.cause).toBe(cause);
  });
});

function nodeIoError(
  code: string,
  syscall: string,
  path: string,
  message: string,
  cause?: unknown,
): Error & NodeJS.ErrnoException {
  return Object.assign(new Error(message, { cause }), { code, errno: -2, syscall, path });
}
