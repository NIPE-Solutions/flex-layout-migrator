import { CodeBlock } from '../components/code-block';
import { siteContent } from '../site-content';
import type { DocumentationPath } from '../router';

interface DocsPageProps {
  readonly path: DocumentationPath;
}

export function DocsPage({ path }: DocsPageProps) {
  const page = siteContent.documentationPages[path];

  return (
    <main id="main-content" className="content-page">
      <section className="content-page__hero" aria-labelledby="page-heading">
        <div className="site-container">
          <h1 id="page-heading">{page.heading}</h1>
          <p>{page.introduction}</p>
        </div>
      </section>
      <div className="site-container docs-layout">
        <nav className="docs-navigation" aria-label="Documentation">
          <ul>
            {siteContent.documentationNavigation.map(item => (
              <li key={item.href}>
                <a href={item.href} aria-current={item.href === path ? 'page' : undefined}>
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <article className="docs-article">
          {page.sections.map(section => (
            <section key={section.heading} aria-labelledby={`section-${slugify(section.heading)}`}>
              <h2 id={`section-${slugify(section.heading)}`}>{section.heading}</h2>
              {section.paragraphs.map(paragraph => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              {'code' in section ? <CodeBlock label={section.heading}>{section.code}</CodeBlock> : null}
            </section>
          ))}
        </article>
      </div>
    </main>
  );
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, '-')
    .replaceAll(/(^-|-$)/gu, '');
}
