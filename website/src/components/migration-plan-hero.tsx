import { useMemo, useState } from 'react';

import { previewTemplate } from '@core/browser/template-preview';

import { verifiedExamples } from '../content/example-reference';
import { SourceDiff, type SourceDiffLine } from './source-diff';
import { StatusLabel } from './status-label';

type MigrationTarget = 'tailwind' | 'css';

const fixture = readHeroFixture();

const targetLabels: Readonly<Record<MigrationTarget, string>> = {
  tailwind: 'Tailwind CSS',
  css: 'Native CSS',
};

const workflow = ['Source', 'Analyze', 'Plan', 'Review', 'Write', 'Verify'] as const;

function readHeroFixture() {
  const registeredFixture = verifiedExamples.find(example => example.id === 'native-css-flex-target-boundary');
  if (registeredFixture === undefined) throw new Error('The migration-plan hero fixture is not registered.');
  return registeredFixture;
}

export function MigrationPlanHero() {
  const [target, setTarget] = useState<MigrationTarget>('tailwind');
  const result = useMemo(() => previewTemplate({ ...fixture.input, target }), [target]);
  const sourceLines = fixture.input.source.trimEnd().split('\n');
  const outputLines = result.html.trimEnd().split('\n');
  const planItems = result.results.map((item, index) => ({
    source: sourceLines[index] ?? '',
    output: outputLines[index] ?? sourceLines[index] ?? '',
    result: item,
  }));
  const diffLines = planItems.flatMap<SourceDiffLine>(item =>
    item.result.status === 'converted'
      ? [
          { kind: 'removed', value: item.source },
          { kind: 'added', value: item.output },
        ]
      : [{ kind: 'preserved', value: item.source }],
  );

  return (
    <section className="migration-plan-hero" aria-labelledby="migration-plan-heading">
      <header className="migration-plan-hero__header">
        <div>
          <p>Example migration plan</p>
          <h2 id="migration-plan-heading">Plan first. Review unresolved cases. Write only when you are ready.</h2>
        </div>
        <fieldset className="migration-plan-hero__targets">
          <legend>Target</legend>
          {(['tailwind', 'css'] as const).map(value => (
            <label key={value}>
              <input
                type="radio"
                name="migration-plan-target"
                value={value}
                checked={target === value}
                onChange={() => setTarget(value)}
              />
              <span>{targetLabels[value]}</span>
            </label>
          ))}
        </fieldset>
      </header>

      <ol className="migration-plan-hero__workflow" aria-label="Migration workflow">
        {workflow.map(stage => (
          <li aria-current={stage === 'Plan' ? 'step' : undefined} key={stage}>
            {stage}
          </li>
        ))}
      </ol>

      <dl className="migration-plan-hero__facts">
        <div>
          <dt>Fixture</dt>
          <dd>
            <code>{fixture.input.fileName}</code>
          </dd>
        </div>
        <div>
          <dt>Mode</dt>
          <dd>Plan preview</dd>
        </div>
        <div>
          <dt>Target</dt>
          <dd>{targetLabels[target]}</dd>
        </div>
        <div>
          <dt>Count</dt>
          <dd>{result.results.length} directives analyzed</dd>
        </div>
        <div>
          <dt>Write status</dt>
          <dd>No project files written</dd>
        </div>
      </dl>

      <div className="migration-plan-hero__body">
        <div className="migration-plan-hero__plan">
          <h3>Plan items</h3>
          <ol>
            {planItems.map((item, index) => (
              <li key={`${item.source}:${index}`}>
                <StatusLabel status={item.result.status} />
                <code>
                  {item.source
                    .match(/\[?(?:(?:fx|gd)[A-Z]\w*|ng(?:Class|Style))\]?(?:\.[\w-]+)?=/u)?.[0]
                    ?.slice(0, -1) ?? 'source'}
                </code>
                {item.result.status === 'converted' ? null : (
                  <span className="migration-plan-hero__preservation">
                    <span aria-hidden="true">=</span>
                    <span>Preserved in source</span>
                  </span>
                )}
                {item.result.status === 'converted' || item.result.status === 'parse-error' ? null : (
                  <a href={`/docs/diagnostics#${item.result.code}`}>{item.result.code}</a>
                )}
              </li>
            ))}
          </ol>
        </div>
        <SourceDiff label="Source change summary" lines={diffLines} />
      </div>

      <section className="migration-plan-hero__output" aria-label="Migration output" aria-live="polite">
        <figure>
          <figcaption>HTML output</figcaption>
          <pre aria-label="Migration HTML output" tabIndex={0}>
            <code>{result.html}</code>
          </pre>
        </figure>
        {result.css === undefined ? null : (
          <figure>
            <figcaption>CSS output</figcaption>
            <pre aria-label="Migration CSS output" tabIndex={0}>
              <code>{result.css}</code>
            </pre>
          </figure>
        )}
      </section>
    </section>
  );
}
