import { siteContent } from '../site-content';
import type { LegalPath } from '../router';

interface LegalPageProps {
  readonly path: LegalPath;
}

export function LegalPage({ path }: LegalPageProps) {
  const page = siteContent.legalPages[path];

  return (
    <main id="main-content" className="content-page">
      <section className="content-page__hero" aria-labelledby="page-heading">
        <div className="site-container">
          <h1 id="page-heading">{page.heading}</h1>
          <p>{page.introduction}</p>
        </div>
      </section>
      <article className="site-container legal-article">
        {page.sections.map(section => (
          <section key={section.heading}>
            <h2>{section.heading}</h2>
            {section.paragraphs.map(paragraph => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </section>
        ))}
      </article>
    </main>
  );
}
