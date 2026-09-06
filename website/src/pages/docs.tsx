import { DocsLayout } from '../components/docs-layout';
import { loadDocumentationPage } from '../content/docs-loader';
import type { DocumentationPath } from '../router';

interface DocsPageProps {
  readonly path: DocumentationPath;
}

export function DocsPage({ path }: DocsPageProps) {
  return <DocsLayout page={loadDocumentationPage(path)} />;
}
