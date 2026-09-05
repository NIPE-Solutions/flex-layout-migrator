import { CodeBlock } from './components/code-block';
import { SiteFooter } from './components/site-footer';
import { SiteHeader } from './components/site-header';
import { siteContent } from './site-content';

export function App() {
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main-content">
        <section className="hero" id="overview">
          <div className="site-container hero__grid">
            <div className="hero__copy">
              <h1>{siteContent.hero.heading}</h1>
              <p className="hero__introduction">{siteContent.hero.introduction}</p>
              <CodeBlock label="Install the beta">{siteContent.installCommand}</CodeBlock>
              <div className="hero__actions" aria-label="Project destinations">
                <a className="action-link action-link--primary" href={siteContent.links.github.href}>
                  {siteContent.links.github.label}
                </a>
                <a className="action-link" href={siteContent.links.npm.href}>
                  {siteContent.links.npm.label}
                </a>
              </div>
            </div>

            <div className="transformation" aria-labelledby="transformation-heading">
              <h2 id="transformation-heading">{siteContent.transformation.heading}</h2>
              <div className="transformation__flow">
                <CodeBlock label={siteContent.transformation.sourceLabel} tone="source">
                  {siteContent.transformation.source}
                </CodeBlock>
                <div className="conversion-node" aria-hidden="true">
                  <span />
                </div>
                <CodeBlock label={siteContent.transformation.outputLabel} tone="output">
                  {siteContent.transformation.output}
                </CodeBlock>
              </div>
            </div>
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
              <p className="privacy-note">{siteContent.playground.privacyStatement}</p>
            </div>
            <div className="playground-shell" aria-label={siteContent.playground.regionLabel}>
              <CodeBlock label={siteContent.transformation.sourceLabel} tone="source">
                {siteContent.transformation.source}
              </CodeBlock>
              <CodeBlock label={siteContent.transformation.outputLabel} tone="output">
                {siteContent.transformation.output}
              </CodeBlock>
            </div>
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
      <SiteFooter />
    </>
  );
}
