export interface TemplateSourceReader {
  read(path: string): Promise<string>;
}
