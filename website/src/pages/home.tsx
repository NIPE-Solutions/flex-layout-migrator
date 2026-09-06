import { lazy, Suspense } from 'react';

import { CodeBlock } from '../components/code-block';
import { siteContent } from '../site-content';

const Playground = lazy(async () => {
  const module = await import('../components/playground');
  return { default: module.Playground };
});

const MigrationPlanHero = lazy(async () => {
  const module = await import('../components/migration-plan-hero');
  return { default: module.MigrationPlanHero };
});

export function HomePage() {
  return (
    <main id="main-content">
      <section className="hero" id="overview">
        <div className="site-container hero__grid">
          <div className="hero__copy">
            <h1>{siteContent.hero.heading}</h1>
            <p className="hero__introduction">{siteContent.hero.introduction}</p>
            <CodeBlock label="Install the beta">{siteContent.installCommand}</CodeBlock>
            <nav className="hero__actions" aria-label="Project destinations">
              <a className="action-link action-link--primary" href={siteContent.links.github.href}>
                {siteContent.links.github.label}
              </a>
              <a className="action-link" href={siteContent.links.npm.href}>
                {siteContent.links.npm.label}
              </a>
            </nav>
          </div>

          <Suspense
            fallback={
              <p className="migration-plan-hero__loading" role="status">
                Loading the example migration plan…
              </p>
            }
          >
            <MigrationPlanHero />
          </Suspense>
        </div>
      </section>

      <section className="support-section" aria-labelledby="target-profile-heading">
        <div className="site-container support-section__grid">
          <div>
            <h2 id="target-profile-heading">Migrate into your Tailwind setup</h2>
            <p>
              Point the codemod at your Tailwind v4 stylesheet or provide an explicit migration profile. Prefixes and
              responsive mappings use the declared target environment.
            </p>
            <a href="/docs/configuration">Tailwind target configuration</a>
          </div>
          <CodeBlock label="Target profile → exact output">{`Tailwind v4
prefix  tw
sm      40rem
md      48rem
lg      64rem

fxLayout="row"
  ↓
tw:flex tw:flex-row tw:box-border`}</CodeBlock>
        </div>
      </section>

      <section className="support-section" aria-labelledby="support-heading">
        <div className="site-container support-section__grid">
          <div>
            <h2 id="support-heading">{siteContent.supportHeading}</h2>
          </div>
          <dl className="support-list">
            {siteContent.supportStatements.map(statement => (
              <div key={statement.term}>
                <dt>{statement.term}</dt>
                <dd>{statement.description}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="playground-section" id="playground" aria-labelledby="playground-heading">
        <div className="site-container">
          <div className="section-heading">
            <h2 id="playground-heading">{siteContent.playground.heading}</h2>
            <p>{siteContent.playground.description}</p>
          </div>
          <Suspense fallback={<p role="status">Loading the browser-only playground…</p>}>
            <Playground />
          </Suspense>
          <ul className="limitations-list" aria-label="Playground limitations">
            {siteContent.limitations.map(limitation => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="documentation-section" id="documentation" aria-labelledby="docs-heading">
        <div className="site-container documentation-section__inner">
          <div>
            <h2 id="docs-heading">{siteContent.documentation.heading}</h2>
            <p>{siteContent.documentation.description}</p>
          </div>
          <a className="action-link action-link--primary" href={siteContent.documentation.link.href}>
            {siteContent.documentation.link.label}
          </a>
        </div>
      </section>
    </main>
  );
}
