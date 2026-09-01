import { readFile } from 'node:fs/promises';
import { compile } from 'tailwindcss';
import { TailwindCandidateClassifier } from './tailwind-candidate-classifier';

const tailwindSource = readFile(
  new URL('../../../../node_modules/tailwindcss/theme.css', import.meta.url),
  'utf8',
).then(theme => `${theme}\n@tailwind utilities;`);

const accepted = [
  ['flex', 'display'],
  ['grid', 'display'],
  ['hidden', 'display'],
  ['flex-row', 'flex-direction'],
  ['flex-wrap', 'flex-wrap'],
  ['items-center', 'align-items'],
  ['gap-4', 'gap'],
  ['-mt-2', 'margin'],
  ['w-[17px]', 'width'],
  ['p-4', 'padding'],
  ['text-sm', 'font-size'],
  ['text-[17px]', 'font-size'],
  ['text-slate-700', 'color'],
  ['bg-blue-500', 'background-color'],
  ['bg-[url(hero.png)]', 'background-image'],
  ['bg-[url(data:image/svg+xml;base64,AAAA)]', 'background-image'],
  ['border', 'border'],
  ['rounded-lg', 'border-radius'],
  ['shadow-md', 'box-shadow'],
  ['opacity-50', 'opacity'],
  ['overflow-hidden', 'overflow'],
  ['absolute', 'position'],
  ['inset-x-0', 'inset'],
  ['rotate-45', 'transform'],
  ['transition-colors', 'transition'],
  ['grid-cols-3', 'grid-template-columns'],
  ['table-auto', 'table-layout'],
  ['list-disc', 'list-style-type'],
  ['object-cover', 'object-fit'],
  ['cursor-pointer', 'cursor'],
  ['pointer-events-none', 'pointer-events'],
  ['visible', 'visibility'],
  ['sr-only', 'accessibility'],
  ['hover:bg-blue-600', 'background-color'],
  ['dark:hover:text-white', 'color'],
  ['![color:red]', 'color'],
  ['[--card-gap:1rem]', '--card-gap'],
  ['w-(--card-width)', 'width'],
] as const;

const compilerRejected = [
  'card',
  'selected',
  'dashboard-panel',
  'plugin-widget',
  'text-brand',
  'bg-brand',
  'gap-brand',
  'w-brand',
  'w-7xs',
  'h-3xs',
  'min-h-3xs',
  'max-h-3xs',
  'text-sm/brand',
  'm-1/2',
  'm-full',
  '-m-auto',
  'max-w-auto',
  'translate-auto',
  'border-0.5',
  'rotate-0.5',
  'scale-0.5',
  'flexible',
  'items-centered',
  'grid-cols-',
  'hover:',
  'w-[17px',
  'w-17px]',
  'w-[1px;color:red]',
  '[;]:flex',
  'bg-[image:]',
  'bg-[image:\n]',
  'flex\\',
  '[color:]',
  '[:red]',
] as const;

const compilerToleratedPolicyRejected = [
  'w-[1px\u0007]',
  'w-[1px\\]',
  '[@media_screen_and_(min-width:_700px)_and_(max-width:_600px)]:flex',
] as const;

const classifierRejected = [
  ...compilerRejected,
  ...compilerToleratedPolicyRejected,
  '',
  '!',
  'w-\\[17px\\]',
  'hover\\:flex',
  '[color:red\\]',
  '[@media_screen_and_(min-width:_600px)]:flex',
] as const;

async function compiles(candidate: string): Promise<boolean> {
  const compiler = await compile(await tailwindSource);
  const emptyCss = compiler.build([]);

  try {
    return compiler.build([candidate]) !== emptyCss;
  } catch {
    return false;
  }
}

describe('TailwindCandidateClassifier', () => {
  test.each(accepted)('verifies compiler-backed candidate %s in property group %s', (candidate, propertyGroup) => {
    const result = new TailwindCandidateClassifier().classify(candidate);

    expect(result.status).toBe('verified');
    if (result.status !== 'verified') return;
    expect(result.descriptor).toMatchObject({
      token: candidate,
      propertyGroup,
    });
  });

  test.each(classifierRejected)('leaves unproven or unsafe source candidate %j unverified', candidate => {
    const result = new TailwindCandidateClassifier().classify(candidate);

    expect(result.status).toBe('unverified');
    if (result.status !== 'unverified') return;
    expect(result.reason.length).toBeGreaterThan(0);
  });

  test.each(accepted)('has Tailwind CSS v4 compiler evidence for accepted candidate %s', async candidate => {
    await expect(compiles(candidate)).resolves.toBe(true);
  });

  test.each(compilerRejected)('has no Tailwind CSS v4 output for rejected candidate %j', async candidate => {
    await expect(compiles(candidate)).resolves.toBe(false);
  });

  test.each(compilerToleratedPolicyRejected)(
    'rejects compiler-tolerated unsafe arbitrary syntax in %j',
    async candidate => {
      expect(new TailwindCandidateClassifier().classify(candidate).status).toBe('unverified');
      await expect(compiles(candidate)).resolves.toBe(true);
    },
  );
});
