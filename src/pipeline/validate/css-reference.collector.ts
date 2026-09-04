import * as path from 'node:path';
import type { OwnedCssReferences } from '../../adapter/css/stylesheet/owned-stylesheet.merger';
import {
  nodeDestinationTemplateSource,
  type DestinationTemplateSource,
} from '../../migrator/destination-template-source';
import { MigrationApplicationError } from '../../migrator/migration-application.error';
import type { FileMigrationPlan } from '../../migrator/migration-plan';
import { AngularTemplateParser } from '../../template/angular-template.parser';
import { templateAttributeKeys } from '../../template/template-attribute';
import type { TemplateParser } from '../analyze/template-parser.port';
import type { RenderedProject } from '../rendered-project';

interface TemplateReferenceSource {
  readonly contents: string;
  readonly complete: boolean;
}

export class CssReferenceCollector {
  constructor(
    private readonly referenceParser: TemplateParser = new AngularTemplateParser(),
    private readonly destinationTemplates: DestinationTemplateSource = nodeDestinationTemplateSource,
  ) {}

  public async collect(rendered: RenderedProject, files: readonly FileMigrationPlan[]): Promise<OwnedCssReferences> {
    if (files.length !== rendered.analyzed.templates.length) throw fileCongruenceInvariant();

    const destinationSources = new Map<string, Promise<TemplateReferenceSource>>();
    const templates = await Promise.all(
      files.map(async (file, index) => {
        const analyzedTemplate = rendered.analyzed.templates[index];
        if (analyzedTemplate === undefined) throw fileCongruenceInvariant();
        if (file.artifact?.kind === 'template' && file.artifact.proposed.status === 'present') {
          return { contents: file.artifact.proposed.contents, complete: true };
        }
        if (path.resolve(file.file.inputPath) === path.resolve(file.file.outputPath)) {
          return { contents: analyzedTemplate.source, complete: true };
        }

        const outputPath = path.normalize(path.resolve(file.file.outputPath));
        const existing = destinationSources.get(outputPath);
        if (existing !== undefined) return existing;
        const pending = this.readDestination(outputPath);
        destinationSources.set(outputPath, pending);
        return pending;
      }),
    );

    const classNames = new Set<string>();
    let complete = true;
    for (const template of templates) {
      complete &&= template.complete;
      const parsed = this.referenceParser.parse(template.contents, 'proposed-template.html');
      if (parsed.status === 'parse-error') {
        complete = false;
        continue;
      }
      for (const attribute of parsed.elements.flatMap(element => element.attributes)) {
        const ngClassAuthority = [...templateAttributeKeys(attribute)].some(
          key => key === 'ngclass' || key.startsWith('ngclass.'),
        );
        const literalClass = attribute.name === 'class' && attribute.binding === 'literal';
        const namedClassBinding = attribute.binding === 'property' && attribute.bindingTarget === 'class';
        const dynamicClass =
          attribute.binding === 'property' && (attribute.name === 'class' || attribute.name === 'className');
        if (!literalClass && !namedClassBinding && !dynamicClass && !ngClassAuthority) continue;

        if (literalClass || (ngClassAuthority && attribute.binding === 'literal')) {
          for (const className of attribute.value.split(/\s+/u)) {
            if (isGeneratedCssClassName(className)) classNames.add(className);
          }
        }
        if (namedClassBinding) {
          const className = namedGeneratedClassName(attribute.name);
          if (className !== undefined) classNames.add(className);
        }
        if (
          dynamicClass ||
          ngClassAuthority ||
          `${attribute.value} ${attribute.rawValue}`.includes('{{') ||
          `${attribute.value} ${attribute.rawValue}`.includes('}}')
        ) {
          complete = false;
        }
      }
    }

    return Object.freeze({ classNames, complete });
  }

  private async readDestination(outputPath: string): Promise<TemplateReferenceSource> {
    try {
      return { contents: await this.destinationTemplates.read(outputPath), complete: true };
    } catch (error: unknown) {
      if (isEnoent(error)) return { contents: '', complete: false };
      throw error;
    }
  }
}

function fileCongruenceInvariant(): MigrationApplicationError {
  return new MigrationApplicationError(
    'internal-invariant',
    'Rendered file plans must match analyzed templates one-to-one and in the same order.',
  );
}

function isGeneratedCssClassName(className: string): boolean {
  return /^flm-[a-f0-9]{64}$/u.test(className);
}

function namedGeneratedClassName(name: string): string | undefined {
  return isGeneratedCssClassName(name) ? name : undefined;
}

function isEnoent(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
