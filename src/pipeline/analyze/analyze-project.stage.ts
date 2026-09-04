import { readFile } from 'node:fs/promises';
import { TemplateAnalyzer } from '../../analyzer/template.analyzer';
import { AngularTemplateParser } from '../../template/angular-template.parser';
import { analyzedProject, type AnalyzedProject, type AnalyzedTemplate } from '../analyzed-project';
import type { AnalyzeStage } from '../migration-pipeline';
import type { ProjectManifest } from '../project-manifest';
import type { TemplateInputAnalyzer } from './template-input-analyzer.port';
import type { TemplateParser } from './template-parser.port';
import type { TemplateSourceReader } from './template-source-reader.port';

const nodeSourceReader: TemplateSourceReader = Object.freeze({
  read: (path: string) => readFile(path, 'utf8'),
});

export class AnalyzeProjectStage implements AnalyzeStage {
  constructor(
    private readonly sourceReader: TemplateSourceReader = nodeSourceReader,
    private readonly parser: TemplateParser = new AngularTemplateParser(),
    private readonly analyzer: TemplateInputAnalyzer = new TemplateAnalyzer(),
  ) {}

  public async run(manifest: ProjectManifest): Promise<AnalyzedProject> {
    const templates: AnalyzedTemplate[] = [];

    for (const file of manifest.templates) {
      const source = await this.sourceReader.read(file.inputPath);
      const parseResult = this.parser.parse(source, file.inputPath);

      templates.push(
        parseResult.status === 'parse-error'
          ? { status: 'parse-error', file, source, parseResult }
          : {
              status: 'parsed',
              file,
              source,
              parseResult,
              inputs: this.analyzer.analyze(file.inputPath, parseResult.elements),
            },
      );
    }

    return analyzedProject({ manifest, templates });
  }
}
