import { useState } from 'react';

import { compatibilityReference, type CompatibilityEntry } from '../content/compatibility-reference';
import { diagnosticReference } from '../content/diagnostic-reference';
import { verifiedExamples } from '../content/example-reference';
import type { CompatibilityStatus } from '../content/public-contract';

type CompatibilityTarget = 'tailwind' | 'css';
type CompatibilityCategory = CompatibilityEntry['category'];

const categoryLabels: Readonly<Record<CompatibilityCategory, string>> = {
  flex: 'Flex',
  visibility: 'Visibility',
  grid: 'Grid',
  'responsive-class-style': 'Responsive class/style',
  images: 'Images',
};

const targetLabels: Readonly<Record<CompatibilityTarget, string>> = {
  tailwind: 'Tailwind CSS',
  css: 'Native CSS',
};

export function CompatibilityExplorer() {
  const [target, setTarget] = useState<CompatibilityTarget>('tailwind');
  const [category, setCategory] = useState<'all' | CompatibilityCategory>('all');
  const [status, setStatus] = useState<'all' | CompatibilityStatus>('all');
  const categories = [...new Set(compatibilityReference.map(entry => entry.category))];
  const statuses = [...new Set(compatibilityReference.flatMap(entry => [entry.tailwind, entry.css]))];
  const entries = compatibilityReference.filter(
    entry => (category === 'all' || entry.category === category) && (status === 'all' || entry[target] === status),
  );

  return (
    <section className="compatibility-explorer" aria-labelledby="compatibility-explorer-heading">
      <h3 id="compatibility-explorer-heading">Compatibility explorer</h3>
      <div className="reference-filters">
        <label>
          Target
          <select value={target} onChange={event => setTarget(event.currentTarget.value as CompatibilityTarget)}>
            <option value="tailwind">Tailwind CSS</option>
            <option value="css">Native CSS</option>
          </select>
        </label>
        <label>
          Family
          <select
            value={category}
            onChange={event => setCategory(event.currentTarget.value as 'all' | CompatibilityCategory)}
          >
            <option value="all">All families</option>
            {categories.map(value => (
              <option value={value} key={value}>
                {categoryLabels[value]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select
            value={status}
            onChange={event => setStatus(event.currentTarget.value as 'all' | CompatibilityStatus)}
          >
            <option value="all">All statuses</option>
            {statuses.map(value => (
              <option value={value} key={value}>
                {statusLabel(value)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="reference-result-count" aria-live="polite">
        {entries.length} {entries.length === 1 ? 'directive' : 'directives'} shown for {targetLabels[target]}.
      </p>
      {entries.length === 0 ? (
        <p>No directives match these filters.</p>
      ) : (
        <div className="reference-table-scroll">
          <table aria-label="Directive compatibility">
            <caption>Registry status for the selected migration target</caption>
            <thead>
              <tr>
                <th scope="col">Directive</th>
                <th scope="col">Family</th>
                <th scope="col">Target</th>
                <th scope="col">Status</th>
                <th scope="col">Evidence and behavior</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(entry => (
                <CompatibilityRow entry={entry} target={target} key={entry.id} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function CompatibilityRow({
  entry,
  target,
}: {
  readonly entry: CompatibilityEntry;
  readonly target: CompatibilityTarget;
}) {
  const examples = verifiedExamples.filter(example =>
    example.category === 'preservation'
      ? true
      : (entry.category === 'flex' || entry.category === 'grid') && example.category === entry.category,
  );
  const selectedStatus = entry[target];
  const dynamicBinding = diagnosticReference.find(diagnostic => diagnostic.code === 'dynamic-binding');
  const targetUnsupported = diagnosticReference.find(diagnostic => diagnostic.code === 'target-unsupported');
  if (dynamicBinding === undefined || targetUnsupported === undefined) {
    throw new Error('Compatibility explorer requires the public dynamic and target diagnostics.');
  }

  return (
    <tr id={entry.id}>
      <th scope="row">
        <a href={`/docs/compatibility#${entry.id}`}>
          <code>{entry.id}</code>
        </a>
      </th>
      <td>{entry.directiveFamily}</td>
      <td>{targetLabels[target]}</td>
      <td>
        <StatusText status={selectedStatus} />
      </td>
      <td>
        <details>
          <summary>Details for {entry.id}</summary>
          <p>{formsDescription(selectedStatus, entry.id, targetLabels[target])}</p>
          <p>
            Target differences: Tailwind CSS: {statusLabel(entry.tailwind)}. Native CSS: {statusLabel(entry.css)}.
          </p>
          <p>Exact verified examples:</p>
          <ul>
            {examples.map(example => (
              <li key={example.id}>
                <a href={`/docs/examples#${example.id}`}>{example.title}</a>
              </li>
            ))}
          </ul>
          <p>
            Runtime expressions follow <a href={`/docs/diagnostics#${dynamicBinding.code}`}>{dynamicBinding.code}</a>; a
            missing target implementation follows{' '}
            <a href={`/docs/diagnostics#${targetUnsupported.code}`}>{targetUnsupported.code}</a>. In both cases, use the
            linked registry guidance before changing the preserved source.
          </p>
        </details>
      </td>
    </tr>
  );
}

export function VerifiedExamples() {
  return (
    <div className="verified-examples">
      {verifiedExamples.map(example => (
        <section
          className="verified-example"
          id={example.id}
          aria-labelledby={`${example.id}-heading`}
          key={example.id}
        >
          <h3 id={`${example.id}-heading`}>{example.title}</h3>
          <p>
            Target: <strong>{targetLabels[example.input.target]}</strong>. Fixture:{' '}
            <code>{example.input.fileName}</code>.
          </p>
          <figure className="code-block code-block--source">
            <figcaption>Input template</figcaption>
            <pre data-example-input>
              <code>{example.input.source}</code>
            </pre>
          </figure>
          <figure className="code-block code-block--output">
            <figcaption>Expected template output</figcaption>
            <pre data-example-output>
              <code>{example.expectedOutput}</code>
            </pre>
          </figure>
          {example.expectedCss === undefined ? null : (
            <figure className="code-block code-block--output">
              <figcaption>Expected stylesheet output</figcaption>
              <pre data-example-css>
                <code>{example.expectedCss}</code>
              </pre>
            </figure>
          )}
          <h4>Expected results</h4>
          <ol>
            {example.expectedResults.map((result, index) => (
              <li key={`${result.status}:${'code' in result ? result.code : 'converted'}:${index}`}>
                <StatusText status={result.status} />
                {'code' in result ? (
                  <>
                    : <a href={`/docs/diagnostics#${result.code}`}>{result.code}</a>
                  </>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function statusLabel(status: string): string {
  return status
    .split('-')
    .map((part, index) => (index === 0 ? `${part.charAt(0).toUpperCase()}${part.slice(1)}` : part))
    .join(' ');
}

function StatusText({ status }: { readonly status: string }) {
  const label = statusLabel(status);
  const symbol = status === 'converted' || status === 'limited' ? '✓' : status === 'invalid' ? '×' : '!';
  return (
    <span className="reference-status" aria-label={`Status: ${label}`}>
      <span aria-hidden="true">{symbol}</span>
      <strong>{label}</strong>
    </span>
  );
}

function formsDescription(status: CompatibilityStatus, id: string, target: string): string {
  if (status === 'limited') {
    return `Supported forms: ${id} has verified conversions inside the bounded literal or static contract for ${target}. Preserved forms: dynamic, conflicting, invalid, or context-dependent inputs remain unchanged with a diagnostic.`;
  }
  if (status === 'preserved') {
    return `Supported forms: the registry lists no automatic ${id} conversion for ${target}. Preserved forms: recognized inputs remain unchanged for review or manual migration.`;
  }
  if (status === 'planned') {
    return `Supported forms: the registry lists no current ${id} conversion for ${target}. Preserved forms: recognized inputs remain unchanged while this status is planned.`;
  }
  return `Supported forms: ${id} is not part of the ${target} migration path. Preserved forms: select the applicable path or leave this source unchanged.`;
}
