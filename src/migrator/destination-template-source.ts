import { readFile } from 'node:fs/promises';

export interface DestinationTemplateSource {
  read(path: string): Promise<string>;
}

export const nodeDestinationTemplateSource: DestinationTemplateSource = Object.freeze({
  read: (path: string) => readFile(path, 'utf8'),
});
