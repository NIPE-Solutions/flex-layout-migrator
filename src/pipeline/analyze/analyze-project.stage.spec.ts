import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import type { LocatedFlexLayoutInput } from '../../analyzer/flex-layout-attribute.analyzer';
import type { TemplateElement, TemplateParseResult } from '../../template/template.model';
import { projectManifest, type ProjectManifest } from '../project-manifest';
import { AnalyzeProjectStage } from './analyze-project.stage';
import type { TemplateInputAnalyzer } from './template-input-analyzer.port';
import type { TemplateParser } from './template-parser.port';
import type { TemplateSourceReader } from './template-source-reader.port';

function manifestFor(fileNames: readonly string[]): ProjectManifest {
  return projectManifest({
    invocation: {
      inputPath: 'templates',
      outputPath: 'generated',
      options: { mode: 'plan' },
    },
    templates: fileNames.map(fileName => ({
      inputPath: path.join('templates', fileName),
      outputPath: path.join('generated', fileName),
    })),
  });
}

function parsedElement(name: string, sourceName: string): TemplateElement {
  const startTagEnd = sourceName.length + name.length + 4;
  return {
    id: '0',
    name,
    source: { start: 0, end: startTagEnd + name.length + 3 },
    startTag: { start: 0, end: startTagEnd },
    endTag: { start: startTagEnd, end: startTagEnd + name.length + 3 },
    structural: false,
    attributes: [
      {
        name: sourceName,
        rawName: sourceName,
        rawValue: '',
        value: '',
        binding: 'literal',
        source: { start: name.length + 2, end: name.length + 2 + sourceName.length },
        nameSource: { start: name.length + 2, end: name.length + 2 + sourceName.length },
      },
    ],
  };
}

function locatedInput(fileName: string, element: TemplateElement): LocatedFlexLayoutInput {
  const attribute = element.attributes[0]!;
  return {
    id: `${fileName}:${attribute.source.start}`,
    fileName,
    elementId: element.id,
    sourceName: attribute.rawName,
    directive: attribute.name === 'fxHide' ? 'fxHide' : 'fxLayout',
    value: attribute.value,
    binding: 'literal',
    breakpoint: undefined,
    source: attribute.source,
    nameSource: attribute.nameSource,
  };
}

describe('AnalyzeProjectStage', () => {
  test('reads, parses, and analyzes every manifest template once in manifest order', async () => {
    const manifest = manifestFor(['zeta.html', 'alpha.html']);
    const [first, second] = manifest.templates.map(template => template.inputPath);
    const sources = new Map<string, string>([
      [first!, '<div fxLayout></div>'],
      [second!, '<span fxHide></span>'],
    ]);
    const readPaths: string[] = [];
    const parseInputs: { source: string; fileName: string }[] = [];
    const analyzePaths: string[] = [];
    const sequence: string[] = [];
    const reader: TemplateSourceReader = {
      async read(inputPath) {
        readPaths.push(inputPath);
        sequence.push(`read:${path.basename(inputPath)}`);
        const source = sources.get(inputPath);
        if (source === undefined) throw new Error(`Unexpected source read: ${inputPath}`);
        return source;
      },
    };
    const parser: TemplateParser = {
      parse(source, fileName) {
        parseInputs.push({ source, fileName });
        sequence.push(`parse:${path.basename(fileName)}`);
        return {
          status: 'parsed',
          elements: [source.startsWith('<div') ? parsedElement('div', 'fxLayout') : parsedElement('span', 'fxHide')],
        };
      },
    };
    const analyzer: TemplateInputAnalyzer = {
      analyze(fileName, elements) {
        analyzePaths.push(fileName);
        sequence.push(`analyze:${path.basename(fileName)}`);
        return [locatedInput(fileName, elements[0]!)];
      },
    };

    const result = await new AnalyzeProjectStage(reader, parser, analyzer).run(manifest);

    expect(result.templates.map(template => template.file.inputPath)).toEqual([first, second]);
    expect(result.templates.map(template => template.status)).toEqual(['parsed', 'parsed']);
    expect(
      result.templates.map(template => (template.status === 'parsed' ? template.inputs[0]!.directive : undefined)),
    ).toEqual(['fxLayout', 'fxHide']);
    expect(readPaths).toEqual([first, second]);
    expect(parseInputs).toEqual([
      { source: '<div fxLayout></div>', fileName: first },
      { source: '<span fxHide></span>', fileName: second },
    ]);
    expect(analyzePaths).toEqual([first, second]);
    expect(sequence).toEqual([
      'read:zeta.html',
      'parse:zeta.html',
      'analyze:zeta.html',
      'read:alpha.html',
      'parse:alpha.html',
      'analyze:alpha.html',
    ]);
  });

  test('keeps parse errors as data and does not analyze their elements', async () => {
    const manifest = manifestFor(['broken.html']);
    const fileName = manifest.templates[0]!.inputPath;
    const source = '<div';
    const analyzePaths: string[] = [];
    const reader: TemplateSourceReader = { read: async () => source };
    const parser: TemplateParser = {
      parse: (): TemplateParseResult => ({
        status: 'parse-error',
        diagnostics: [{ message: 'Unexpected end of input', source: { start: 0, end: 4 } }],
      }),
    };
    const analyzer: TemplateInputAnalyzer = {
      analyze(inputPath) {
        analyzePaths.push(inputPath);
        return [];
      },
    };

    const result = await new AnalyzeProjectStage(reader, parser, analyzer).run(manifest);

    expect(result.templates[0]).toEqual({
      status: 'parse-error',
      file: { inputPath: fileName, outputPath: manifest.templates[0]!.outputPath },
      source,
      parseResult: {
        status: 'parse-error',
        diagnostics: [{ message: 'Unexpected end of input', source: { start: 0, end: 4 } }],
      },
    });
    expect(analyzePaths).toEqual([]);
  });

  test('propagates a source-read rejection without parsing or continuing', async () => {
    const manifest = manifestFor(['first.html', 'second.html']);
    const readError = new Error('read failed');
    const sequence: string[] = [];
    const reader: TemplateSourceReader = {
      async read(inputPath) {
        sequence.push(`read:${path.basename(inputPath)}`);
        throw readError;
      },
    };
    const parser: TemplateParser = {
      parse() {
        sequence.push('parse');
        return { status: 'parsed', elements: [] };
      },
    };
    const analyzer: TemplateInputAnalyzer = {
      analyze() {
        sequence.push('analyze');
        return [];
      },
    };

    await expect(new AnalyzeProjectStage(reader, parser, analyzer).run(manifest)).rejects.toBe(readError);
    expect(sequence).toEqual(['read:first.html']);
  });

  test('propagates a parser failure without analyzing or continuing', async () => {
    const manifest = manifestFor(['first.html', 'second.html']);
    const parseError = new Error('parser failed');
    const sequence: string[] = [];
    const reader: TemplateSourceReader = {
      async read(inputPath) {
        sequence.push(`read:${path.basename(inputPath)}`);
        return '<div></div>';
      },
    };
    const parser: TemplateParser = {
      parse(_source, fileName) {
        sequence.push(`parse:${path.basename(fileName)}`);
        throw parseError;
      },
    };
    const analyzer: TemplateInputAnalyzer = {
      analyze() {
        sequence.push('analyze');
        return [];
      },
    };

    await expect(new AnalyzeProjectStage(reader, parser, analyzer).run(manifest)).rejects.toBe(parseError);
    expect(sequence).toEqual(['read:first.html', 'parse:first.html']);
  });

  test('returns frozen defensive ownership of parser and analyzer values', async () => {
    const manifest = manifestFor(['owned.html']);
    const element = parsedElement('div', 'fxLayout');
    const elements = [element];
    const input = locatedInput(manifest.templates[0]!.inputPath, element);
    const inputs = [input];
    const reader: TemplateSourceReader = { read: async () => '<div fxLayout></div>' };
    const parser: TemplateParser = { parse: () => ({ status: 'parsed', elements }) };
    const analyzer: TemplateInputAnalyzer = { analyze: () => inputs };

    const result = await new AnalyzeProjectStage(reader, parser, analyzer).run(manifest);
    const analyzed = result.templates[0]!;
    if (analyzed.status !== 'parsed') throw new Error('Expected parsed template.');

    expect(analyzed.file).toBe(result.manifest.templates[0]);
    expect(analyzed.parseResult.elements).not.toBe(elements);
    expect(analyzed.inputs).not.toBe(inputs);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.manifest)).toBe(true);
    expect(Object.isFrozen(result.templates)).toBe(true);
    expect(Object.isFrozen(analyzed)).toBe(true);
    expect(Object.isFrozen(analyzed.parseResult.elements)).toBe(true);
    expect(Object.isFrozen(analyzed.parseResult.elements[0])).toBe(true);
    expect(Object.isFrozen(analyzed.inputs)).toBe(true);
    expect(Object.isFrozen(analyzed.inputs[0])).toBe(true);

    elements.pop();
    inputs.pop();
    (element.source as { start: number }).start = 10;
    (input.source as { start: number }).start = 10;
    expect(analyzed.parseResult.elements).toHaveLength(1);
    expect(analyzed.parseResult.elements[0]!.source.start).toBe(0);
    expect(analyzed.inputs).toHaveLength(1);
    expect(analyzed.inputs[0]!.source.start).not.toBe(10);
  });

  test('returns an empty frozen project without invoking any input port', async () => {
    const manifest = manifestFor([]);
    const calls: string[] = [];
    const reader: TemplateSourceReader = {
      async read() {
        calls.push('read');
        return '';
      },
    };
    const parser: TemplateParser = {
      parse() {
        calls.push('parse');
        return { status: 'parsed', elements: [] };
      },
    };
    const analyzer: TemplateInputAnalyzer = {
      analyze() {
        calls.push('analyze');
        return [];
      },
    };

    const result = await new AnalyzeProjectStage(reader, parser, analyzer).run(manifest);

    expect(result.manifest).toEqual(manifest);
    expect(result.templates).toEqual([]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.templates)).toBe(true);
    expect(calls).toEqual([]);
  });

  test('uses target-neutral production defaults for source reading, parsing, and input analysis', async () => {
    const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'analyze-project-'));
    const inputPath = path.join(temporaryDirectory, 'input.html');
    const outputPath = path.join(temporaryDirectory, 'output.html');
    const source = '<div fxLayout="row"></div>';
    await writeFile(inputPath, source, 'utf8');

    try {
      const manifest = projectManifest({
        invocation: { inputPath, outputPath, options: { mode: 'plan' } },
        templates: [{ inputPath, outputPath }],
      });

      const result = await new AnalyzeProjectStage().run(manifest);
      const analyzed = result.templates[0]!;

      expect(analyzed).toMatchObject({ status: 'parsed', source });
      if (analyzed.status !== 'parsed') throw new Error('Expected parsed template.');
      expect(analyzed.inputs).toHaveLength(1);
      expect(analyzed.inputs[0]).toMatchObject({
        fileName: inputPath,
        directive: 'fxLayout',
        value: 'row',
      });
      expect(Object.keys(result).sort()).toEqual(['manifest', 'templates']);
      expect(Object.keys(analyzed).sort()).toEqual(['file', 'inputs', 'parseResult', 'source', 'status']);
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });
});
