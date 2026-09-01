import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { compile } from 'tailwindcss';
import { AngularTemplateParser } from '../../src/template/angular-template.parser';

const executeFile = promisify(execFile);
const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const compatibilityFixture = new URL('../fixtures/compatibility/extended-responsive.expected.html', import.meta.url);
const tailwindTheme = new URL('../../node_modules/tailwindcss/theme.css', import.meta.url);
const tailwindCli = fileURLToPath(new URL('../../node_modules/@tailwindcss/cli/dist/index.mjs', import.meta.url));

async function scanRawTemplate(rawTemplate: string): Promise<string> {
  const temporaryDirectory = await mkdtemp(`${projectRoot}.tailwind-raw-source-`);

  try {
    await writeFile(`${temporaryDirectory}/fixture.html`, rawTemplate, 'utf8');
    await writeFile(
      `${temporaryDirectory}/input.css`,
      '@import "tailwindcss/theme.css";\n@tailwind utilities;\n@source "./fixture.html";\n',
      'utf8',
    );
    const { stdout, stderr } = await executeFile(
      process.execPath,
      [tailwindCli, '--input', 'input.css', '--cwd', temporaryDirectory, '--silent'],
      { encoding: 'utf8' },
    );

    expect(stderr).toBe('');
    return stdout.trimEnd();
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

function classDiscoveryFixture(template: string): {
  readonly candidates: readonly string[];
  readonly rawTemplate: string;
} {
  const parsed = new AngularTemplateParser().parse(template, 'fixture.html');
  if (parsed.status !== 'parsed') throw new Error(parsed.diagnostics.map(item => item.message).join('\n'));
  const classAttributes = parsed.elements.flatMap(element =>
    element.attributes.filter(attribute => attribute.binding === 'literal' && attribute.name.toLowerCase() === 'class'),
  );

  return {
    candidates: [
      ...new Set(classAttributes.flatMap(attribute => attribute.value.split(/[\t\n\f\r ]+/u).filter(Boolean))),
    ],
    // Feed Tailwind only the class bytes emitted by the codemod. Responsive
    // attributes that are intentionally preserved can contain unrelated words
    // which Tailwind also discovers as utilities.
    rawTemplate: classAttributes.map(attribute => `<div class="${attribute.rawValue}"></div>`).join('\n'),
  };
}

describe('Tailwind raw template discovery', () => {
  test('discovers every decoded class candidate in the public expected fixture without HTML entity decoding', async () => {
    const template = await readFile(compatibilityFixture, 'utf8');
    const { candidates, rawTemplate } = classDiscoveryFixture(template);
    const theme = await readFile(tailwindTheme, 'utf8');
    const compiler = await compile(`${theme}\n@tailwind utilities;`);
    const expectedCss = compiler.build([...candidates]);

    await expect(scanRawTemplate(rawTemplate)).resolves.toBe(expectedCss.trimEnd());
  });

  test('discovers an exact ampersand selector but does not decode HTML references into candidates', async () => {
    const theme = await readFile(tailwindTheme, 'utf8');
    const tailwindSource = `${theme}\n@tailwind utilities;`;
    const exactCandidate = '[&>*]:p-4';
    const decodedQuoteCandidate = '[content:"quoted&copy;"]';
    const encodedSingleQuoteCandidate = "[content:'quoted&amp;copy;']";
    const exactCss = (await compile(tailwindSource)).build([exactCandidate]).trimEnd();
    const decodedQuoteCss = (await compile(tailwindSource)).build([decodedQuoteCandidate]).trimEnd();
    const encodedSingleQuoteCss = (await compile(tailwindSource)).build([encodedSingleQuoteCandidate]).trimEnd();
    const emptyCss = (await compile(tailwindSource)).build([]).trimEnd();

    await expect(scanRawTemplate(`<div class="${exactCandidate}"></div>`)).resolves.toBe(exactCss);
    expect(decodedQuoteCss).not.toBe(emptyCss);
    await expect(scanRawTemplate('<div class="[content:&quot;quoted&amp;copy;&quot;]"></div>')).resolves.toBe(emptyCss);
    expect(encodedSingleQuoteCss).not.toBe(decodedQuoteCss);
    await expect(scanRawTemplate(`<div class="${encodedSingleQuoteCandidate}"></div>`)).resolves.toBe(
      encodedSingleQuoteCss,
    );
  });
});
