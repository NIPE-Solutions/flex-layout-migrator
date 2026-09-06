import { analyzeTailwindStylesheet, resolveTailwindTargetProfile } from '@core/config/tailwind-target-profile';
import { useRef, useState, type KeyboardEvent } from 'react';

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
  const [prefix, setPrefix] = useState('');
  const [breakpoints, setBreakpoints] = useState('');
  const [targetCss, setTargetCss] = useState('');
  const [profileError, setProfileError] = useState('');
  const [result, setResult] = useState<TemplatePreviewResult>();
  const [activeTab, setActiveTab] = useState<OutputTab>('html');
  const [status, setStatus] = useState('Ready to preview one template.');
  const htmlTab = useRef<HTMLButtonElement>(null);
  const cssTab = useRef<HTMLButtonElement>(null);

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

  function migrate(nextPrefix = prefix, nextBreakpoints = breakpoints, nextCss = targetCss): void {
    let nextResult: TemplatePreviewResult;
    try {
      const custom: Record<string, string | null> = {};
      for (const line of nextBreakpoints
        .split('\n')
        .map(value => value.trim())
        .filter(Boolean)) {
        const entry = /^(\*|[a-zA-Z0-9_-]+)\s+(\S+)$/.exec(line);
        if (!entry || Object.hasOwn(custom, entry[1]!))
          throw new Error('Target breakpoints require unique name and length pairs, for example tablet 48rem.');
        custom[entry[1]!] = entry[2] === 'initial' ? null : entry[2]!;
      }
      const targetProfile =
        target === 'tailwind'
          ? resolveTailwindTargetProfile({
              ...(nextCss.trim() ? { detected: analyzeTailwindStylesheet(nextCss) } : {}),
              ...(nextPrefix || nextBreakpoints.trim()
                ? { explicit: { ...(nextPrefix ? { prefix: nextPrefix } : {}), breakpoints: custom } }
                : {}),
            })
          : undefined;
      nextResult = previewTemplate({ source, target, targetProfile });
      setProfileError('');
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'Target configuration is invalid.');
      invalidatePreview('Target configuration needs correction.');
      return;
    }
    setResult(nextResult);
    setActiveTab('html');
    const converted = nextResult.results.filter(item => item.status === 'converted').length;
    if (nextResult.state === 'rejected') {
      setStatus('Generated proposal rejected. Original source is preserved.');
      return;
    }
    if (nextResult.state === 'review-required') {
      setStatus(
        `Migration needs review. ${nextResult.diagnostics.length} ${pluralize(nextResult.diagnostics.length, 'diagnostic')} reported.`,
      );
      return;
    }
    setStatus(`Preview complete. ${converted} ${pluralize(converted, 'directive')} converted.`);
  }

  function reset(): void {
    setPrefix('');
    setBreakpoints('');
    setTargetCss('');
    setProfileError('');
    setPresetId(initialPlaygroundPreset.id);
    setSource(initialPlaygroundPreset.source);
    setTarget('tailwind');
    setResult(undefined);
    setActiveTab('html');
    setStatus('Playground reset. Ready to preview one template.');
  }

  function handleOutputTabKey(event: KeyboardEvent<HTMLButtonElement>, currentTab: OutputTab): void {
    const tabs: readonly OutputTab[] = result?.css === undefined ? ['html'] : ['html', 'css'];
    const currentIndex = tabs.indexOf(currentTab);
    let nextTab: OutputTab | undefined;

    switch (event.key) {
      case 'ArrowLeft':
        nextTab = tabs[(currentIndex - 1 + tabs.length) % tabs.length];
        break;
      case 'ArrowRight':
        nextTab = tabs[(currentIndex + 1) % tabs.length];
        break;
      case 'Home':
        nextTab = tabs[0];
        break;
      case 'End':
        nextTab = tabs[tabs.length - 1];
        break;
      default:
        return;
    }

    event.preventDefault();
    if (nextTab === undefined) return;
    setActiveTab(nextTab);
    (nextTab === 'html' ? htmlTab : cssTab).current?.focus();
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

        {target === 'tailwind' ? (
          <fieldset className="target-profile-controls">
            <legend>
              {prefix || breakpoints || targetCss
                ? 'Profile: custom Tailwind v4 environment'
                : 'Profile: Tailwind v4 defaults'}
            </legend>
            <label>
              Tailwind prefix
              <input
                value={prefix}
                placeholder="none"
                onChange={event => {
                  setPrefix(event.target.value);
                  if (result) migrate(event.target.value, breakpoints, targetCss);
                }}
              />
            </label>
            <label>
              Target breakpoints
              <textarea
                rows={3}
                value={breakpoints}
                placeholder={'tablet 48rem\ndesktop 80rem'}
                spellCheck={false}
                onChange={event => {
                  setBreakpoints(event.target.value);
                  if (result) migrate(prefix, event.target.value, targetCss);
                }}
              />
            </label>
            <p>
              Leave blank for defaults or pasted CSS settings. Use <code>* initial</code> to replace the breakpoint
              namespace.
            </p>
            <details>
              <summary>Analyze Tailwind stylesheet</summary>
              <p>
                Extracts migration-relevant Tailwind configuration from this stylesheet. Local imports are not loaded
                here. Nothing is uploaded or persisted.
              </p>
              <label>
                Target stylesheet CSS
                <textarea
                  rows={5}
                  value={targetCss}
                  spellCheck={false}
                  onChange={event => {
                    setTargetCss(event.target.value);
                    if (result) migrate(prefix, breakpoints, event.target.value);
                  }}
                />
              </label>
            </details>
            {profileError ? <p role="alert">{profileError}</p> : null}
          </fieldset>
        ) : null}

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
            {result.targetProfile ? (
              <details className="target-assumptions" open>
                <summary>Assumptions {result.targetProfile.assumptions.length}</summary>
                <p>
                  Profile: {result.targetProfile.fingerprint}; prefix: {result.targetProfile.prefix.value ?? 'none'}
                </p>
                <ul>
                  {result.targetProfile.assumptions.map(item => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                {result.targetProfile.diagnostics.map((item, index) => (
                  <p key={index}>
                    [{item.code}] {item.message}
                  </p>
                ))}
              </details>
            ) : null}
            <div className="output-tabs" role="tablist" aria-label="Migration output format">
              <button
                ref={htmlTab}
                id="output-tab-html"
                type="button"
                role="tab"
                aria-selected={activeTab === 'html'}
                aria-controls="output-panel-html"
                tabIndex={activeTab === 'html' ? 0 : -1}
                onClick={() => setActiveTab('html')}
                onKeyDown={event => handleOutputTabKey(event, 'html')}
              >
                HTML
              </button>
              {result.css === undefined ? null : (
                <button
                  ref={cssTab}
                  id="output-tab-css"
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'css'}
                  aria-controls="output-panel-css"
                  tabIndex={activeTab === 'css' ? 0 : -1}
                  onClick={() => setActiveTab('css')}
                  onKeyDown={event => handleOutputTabKey(event, 'css')}
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
