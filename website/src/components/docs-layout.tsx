import { Fragment, type ReactNode, useEffect, useState } from 'react';

import { documentationGroups, getDocumentationNeighbors, type DocumentationRoute } from '../content/docs-navigation';
import type { DocumentationBlock, DocumentationPage } from '../content/docs-loader';
import { reportReference } from '../content/report-reference';
import { CodeBlock } from './code-block';
import { CompatibilityExplorer, VerifiedExamples } from './compatibility-explorer';
import { DiagnosticCallout } from './diagnostic-callout';
import { DiagnosticReference } from './diagnostic-reference';
import { largeCodebaseChecklist, MigrationChecklist } from './migration-checklist';
import { ReportExample } from './report-example';

interface DocsLayoutProps {
  readonly page: DocumentationPage;
}

export function DocsLayout({ page }: DocsLayoutProps) {
  const activeGroup = documentationGroups.find(group => group.id === page.group);
  if (activeGroup === undefined) throw new Error(`active documentation route ${page.path} has no navigation group`);
  const neighbors = getDocumentationNeighbors(page.path);

  return (
    <main id="main-content" className="content-page">
      <section className="content-page__hero" aria-labelledby="page-heading">
        <div className="site-container">
          <p className="docs-breadcrumb">Documentation / {activeGroup.label}</p>
          <h1 id="page-heading">{page.title}</h1>
          <p>{page.description}</p>
        </div>
      </section>
      <div className="site-container docs-layout">
        <DocumentationNavigation activePath={page.path} />
        <article className="docs-article">
          <OnThisPage page={page} />
          <MarkdownBlocks blocks={page.blocks} />
          <footer className="docs-article__footer">
            <a href={page.editUrl}>Edit this page on GitHub</a>
            <nav className="docs-pagination" aria-label="Adjacent documentation">
              {neighbors.previous === undefined ? (
                <span />
              ) : (
                <NeighborLink direction="Previous" route={neighbors.previous} />
              )}
              {neighbors.next === undefined ? <span /> : <NeighborLink direction="Next" route={neighbors.next} />}
            </nav>
          </footer>
        </article>
      </div>
    </main>
  );
}

function DocumentationNavigation({ activePath }: { readonly activePath: string }) {
  const groups = documentationGroups.map(group => (
    <section className="docs-navigation__group" key={group.id}>
      <h2>{group.label}</h2>
      <RouteList routes={group.routes} activePath={activePath} />
    </section>
  ));
  return (
    <>
      <nav className="docs-navigation docs-navigation--desktop" aria-label="Documentation">
        {groups}
      </nav>
      <MobileDocumentationNavigation activePath={activePath} />
    </>
  );
}

function MobileDocumentationNavigation({ activePath }: { readonly activePath: string }) {
  const activeGroup = documentationGroups.find(group => group.routes.some(route => route.path === activePath));
  if (activeGroup === undefined) throw new Error(`active documentation route ${activePath} has no mobile group`);
  const [openGroups, setOpenGroups] = useState<ReadonlySet<string>>(() => new Set([activeGroup.id]));

  useEffect(() => setOpenGroups(new Set([activeGroup.id])), [activeGroup.id, activePath]);

  return (
    <nav className="docs-navigation docs-navigation--mobile" aria-label="Mobile documentation">
      {documentationGroups.map(group => (
        <details
          key={group.id}
          open={openGroups.has(group.id)}
          onToggle={event => {
            const isOpen = event.currentTarget.open;
            setOpenGroups(current => {
              const next = new Set(current);
              if (isOpen) next.add(group.id);
              else next.delete(group.id);
              return next;
            });
          }}
        >
          <summary>{group.label}</summary>
          <RouteList routes={group.routes} activePath={activePath} />
        </details>
      ))}
    </nav>
  );
}

function RouteList({
  routes,
  activePath,
}: {
  readonly routes: readonly DocumentationRoute[];
  readonly activePath: string;
}) {
  return (
    <ul>
      {routes.map(route => (
        <li key={route.path}>
          <a href={route.path} aria-current={route.path === activePath ? 'page' : undefined}>
            {route.title}
          </a>
        </li>
      ))}
    </ul>
  );
}

function OnThisPage({ page }: { readonly page: DocumentationPage }) {
  return (
    <nav className="docs-jump-navigation" aria-label="On this page">
      <p>On this page</p>
      <ul>
        {page.headings.map(heading => (
          <li key={heading.id} className={heading.depth === 3 ? 'docs-jump-navigation__nested' : undefined}>
            <a href={`#${heading.id}`}>{heading.text}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function MarkdownBlocks({ blocks }: { readonly blocks: readonly DocumentationBlock[] }) {
  return blocks.map((block, index) => {
    if (block.kind === 'content') return <DocumentationContent block={block} key={index} />;
    if (block.kind === 'heading') {
      return block.depth === 2 ? (
        <h2 id={block.id} key={block.id}>
          {block.text}
        </h2>
      ) : (
        <h3 id={block.id} key={block.id}>
          {block.text}
        </h3>
      );
    }
    if (block.kind === 'paragraph') return <p key={index}>{renderInline(block.text)}</p>;
    if (block.kind === 'list') {
      return (
        <ul key={index}>
          {block.items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInline(item)}</li>
          ))}
        </ul>
      );
    }
    return (
      <CodeBlock key={index} label={block.language === undefined ? 'Command or source' : `${block.language} source`}>
        {block.value}
      </CodeBlock>
    );
  });
}

function DocumentationContent({ block }: { readonly block: Extract<DocumentationBlock, { kind: 'content' }> }) {
  if (block.name === 'migration-checklist') return <MigrationChecklist {...largeCodebaseChecklist} />;
  if (block.name === 'diagnostic-callout') return <DiagnosticCallout code={block.code} />;
  if (block.name === 'compatibility-explorer') return <CompatibilityExplorer />;
  if (block.name === 'diagnostic-reference') return <DiagnosticReference />;
  if (block.name === 'verified-examples') return <VerifiedExamples />;
  if (block.name === 'report-example') {
    const example = reportReference.examples.find(candidate => candidate.id === block.exampleId);
    if (example === undefined) throw new Error(`Unknown report example: ${block.exampleId}`);
    return <ReportExample report={example.value} label="Plan report example" />;
  }
  throw new Error(`Unknown documentation content block: ${block.name}`);
}

function renderInline(source: string): ReactNode {
  const parts = source.split(/(`[^`]+`|\[[^\]]+\]\([^)]+\))/gu);
  return parts.map((part, index) => {
    const code = part.match(/^`([^`]+)`$/u);
    if (code !== null) return <code key={index}>{code[1]}</code>;
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/u);
    if (link !== null)
      return (
        <a href={link[2]} key={index}>
          {link[1]}
        </a>
      );
    return <Fragment key={index}>{part}</Fragment>;
  });
}

function NeighborLink({
  direction,
  route,
}: {
  readonly direction: 'Previous' | 'Next';
  readonly route: DocumentationRoute;
}) {
  return (
    <a href={route.path} className={`docs-pagination__${direction.toLowerCase()}`}>
      <span>{direction}:</span> {route.title}
    </a>
  );
}
