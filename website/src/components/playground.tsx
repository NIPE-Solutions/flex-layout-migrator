import { useState } from 'react';

import { previewTemplate, type TemplatePreviewResult } from '@core/browser/template-preview';

import { initialPlaygroundPreset, playgroundPresets } from '../content/presets';
import { siteContent } from '../site-content';
import { CopyButton } from './copy-button';
import { DiagnosticList } from './diagnostic-list';

type MigrationTarget = 'tailwind' | 'css';
type OutputTab = 'html' | 'css';

export function Playground() {
  const [presetId, setPresetId] = useState<string>(initialPlaygroundPreset.id);
  const [source, setSource] = useState<string>(initialPlaygroundPreset.source);
  const [target, setTarget] = useState<MigrationTarget>('tailwind');
  const [result, setResult] = useState<TemplatePreviewResult>();
  const [activeTab, setActiveTab] = useState<OutputTab>('html');
  const [status, setStatus] = useState('Ready to preview one template.');

  function invalidatePreview(message: string): void {
    setResult(undefined);
    setActiveTab('html');
    setStatus(message);
  }

  function selectPreset(nextId: string): void {
    const preset = playgroundPresets.find(item => item.id === nextId);
    if (preset === undefined) return;
    setPresetId(preset.id);
    setSource(preset.source);
    invalidatePreview(`${preset.label} loaded. Run migration to preview it.`);
  }

  function selectTarget(nextTarget: MigrationTarget): void {
    setTarget(nextTarget);
    invalidatePreview(
      `${nextTarget === 'tailwind' ? 'Tailwind CSS' : 'Native CSS'} selected. Run migration to preview it.`,
    );
  }

  function migrate(): void {
    const nextResult = previewTemplate({ source, target });
    setResult(nextResult);
    setActiveTab('html');
    const converted = nextResult.results.filter(item => item.status === 'converted').length;
    if (nextResult.diagnostics.length > 0) {
      setStatus(
        `Migration needs review. ${nextResult.diagnostics.length} ${pluralize(nextResult.diagnostics.length, 'diagnostic')} reported.`,
      );
      return;
    }
    setStatus(`Migration complete. ${converted} ${pluralize(converted, 'directive')} converted.`);
  }

  function reset(): void {
    setPresetId(initialPlaygroundPreset.id);
    setSource(initialPlaygroundPreset.source);
    setTarget('tailwind');
    setResult(undefined);
    setActiveTab('html');
    setStatus('Playground reset. Ready to preview one template.');
  }

  return (
    <section className="playground-workspace" aria-label={siteContent.playground.regionLabel}>
      <p className="playground-assurance">{siteContent.playground.privacyStatement}</p>
      <form
        className="playground-form"
        onSubmit={event => {
          event.preventDefault();
          migrate();
        }}
      >
        <div className="playground-panel__header">
          <div>
            <h3>Template input</h3>
            <p>{playgroundPresets.find(item => item.id === presetId)?.description ?? 'Your edited template.'}</p>
          </div>
          <label className="preset-control">
            <span>Template preset</span>
            <select value={presetId} onChange={event => selectPreset(event.target.value)}>
              {presetId === 'custom' ? <option value="custom">Custom input</option> : null}
              {playgroundPresets.map(preset => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="source-editor">
          <span>Angular template</span>
          <textarea
            value={source}
            spellCheck={false}
            onChange={event => {
              setPresetId('custom');
              setSource(event.target.value);
              invalidatePreview('Template changed. Run migration to update the preview.');
            }}
          />
        </label>

        <fieldset className="target-switcher">
          <legend>Migration target</legend>
          <label>
            <input
              type="radio"
              name="target"
              value="tailwind"
              checked={target === 'tailwind'}
              onChange={() => selectTarget('tailwind')}
            />
            <span>Tailwind CSS</span>
          </label>
          <label>
            <input
              type="radio"
              name="target"
              value="css"
              checked={target === 'css'}
              onChange={() => selectTarget('css')}
            />
            <span>Native CSS</span>
          </label>
        </fieldset>

        <div className="playground-actions">
          <button className="action-button action-button--primary" type="submit">
            Migrate template
          </button>
          <button className="action-button" type="button" onClick={reset}>
            Reset playground
          </button>
        </div>
      </form>

      <section className="playground-output" aria-label="Migration output">
        <div className="playground-panel__header">
          <div>
            <h3>Proposed output</h3>
            <p>Nothing is written. Copy the proposal into your own review workflow.</p>
          </div>
          {result === undefined ? null : (
            <CopyButton
              label={activeTab === 'html' ? 'HTML' : 'CSS'}
              value={activeTab === 'html' ? result.html : (result.css ?? '')}
              onStatus={setStatus}
            />
          )}
        </div>

        {result === undefined ? (
          <p className="playground-empty">Run a migration to inspect the proposed output.</p>
        ) : (
          <>
            <div className="output-tabs" role="tablist" aria-label="Migration output format">
              <button
                id="output-tab-html"
                type="button"
                role="tab"
                aria-selected={activeTab === 'html'}
                aria-controls="output-panel-html"
                onClick={() => setActiveTab('html')}
              >
                HTML
              </button>
              {result.css === undefined ? null : (
                <button
                  id="output-tab-css"
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'css'}
                  aria-controls="output-panel-css"
                  onClick={() => setActiveTab('css')}
                >
                  CSS
                </button>
              )}
            </div>
            <div
              id="output-panel-html"
              className="output-panel"
              role="tabpanel"
              aria-labelledby="output-tab-html"
              hidden={activeTab !== 'html'}
              tabIndex={0}
            >
              <pre>
                <code>{result.html}</code>
              </pre>
            </div>
            {result.css === undefined ? null : (
              <div
                id="output-panel-css"
                className="output-panel"
                role="tabpanel"
                aria-labelledby="output-tab-css"
                hidden={activeTab !== 'css'}
                tabIndex={0}
              >
                <pre>
                  <code>{result.css}</code>
                </pre>
              </div>
            )}
          </>
        )}
      </section>

      <p className="playground-status" role="status" aria-live="polite">
        {status}
      </p>
      {result === undefined ? null : <DiagnosticList diagnostics={result.diagnostics} />}
    </section>
  );
}

function pluralize(count: number, singular: string): string {
  return count === 1 ? singular : `${singular}s`;
}
