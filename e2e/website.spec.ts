import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const sourceMarker = 'private-source-marker-4917';

test('renders responsive navigation and follows a direct documentation link', async ({ page }, testInfo) => {
  const rawDeepLink = await page.request.get('/docs/tailwind');
  expect(await rawDeepLink.text()).toContain(
    '<link rel="canonical" href="https://angular-flex-layout-codemod.nipesolutions.com/docs/tailwind"',
  );
  await page.goto('/docs/tailwind');

  await expect(page.getByRole('heading', { level: 1, name: 'Tailwind CSS' })).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://angular-flex-layout-codemod.nipesolutions.com/docs/tailwind',
  );
  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'NIPE Open Source' }).first()).toHaveAttribute(
    'href',
    'https://opensource.nipesolutions.com',
  );
  const oversizedScripts = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .filter(entry => entry.name.endsWith('.js') && (entry as PerformanceResourceTiming).decodedBodySize > 500 * 1024)
      .map(entry => entry.name),
  );
  expect(oversizedScripts, 'documentation routes must not load the Angular compiler bundle').toEqual([]);

  const viewportWidth = page.viewportSize()?.width ?? 0;
  const bodyWidth = await page.locator('body').evaluate(element => element.scrollWidth);
  expect(bodyWidth, `${testInfo.project.name} layout should not overflow horizontally`).toBeLessThanOrEqual(
    viewportWidth,
  );
});

test('restores initial documentation fragments and focuses hash navigation targets', async ({ page }) => {
  await page.goto('/docs/diagnostics#dynamic-binding');
  const diagnostic = page.locator('#dynamic-binding');
  await expect(diagnostic).toBeFocused();
  await expect(diagnostic).toBeInViewport();

  await page.goto('/docs/compatibility#gdColumns');
  const directive = page.locator('#gdColumns');
  await expect(directive).toBeFocused();
  await expect(directive).toBeInViewport();

  await page.goto('/docs/diagnostics');
  await page.getByRole('link', { name: 'dynamic-binding' }).click();
  await expect(page).toHaveURL(/\/docs\/diagnostics#dynamic-binding$/u);
  await expect(page.locator('#dynamic-binding')).toBeFocused();
});

test('exposes canonical metadata, keyboard focus order, and no critical accessibility violations', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://angular-flex-layout-codemod.nipesolutions.com/',
  );
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Flex Layout Codemod home' })).toBeFocused();
  await expect(page.getByRole('textbox', { name: 'Angular template' })).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter(violation => violation.impact === 'critical')).toEqual([]);
});

test('converts both targets, operates output tabs with arrows, and transmits no editor source', async ({ page }) => {
  const sourceBearingRequests: string[] = [];
  const requestsAfterEditing: string[] = [];
  let editingStarted = false;
  page.on('request', request => {
    const requestEvidence = [request.url(), request.postData() ?? '', JSON.stringify(request.headers())].join('\n');
    if (requestEvidence.includes(sourceMarker)) sourceBearingRequests.push(request.url());
    if (editingStarted) requestsAfterEditing.push(request.url());
  });

  await page.goto('/');
  const playground = page.getByRole('region', { name: 'Migration playground preview' });
  const source = playground.getByRole('textbox', { name: 'Angular template' });
  await expect(source).toBeVisible();
  editingStarted = true;
  await source.fill(`<section id="${sourceMarker}" fxLayout="column"></section>`);
  await playground.getByRole('button', { name: 'Migrate template' }).click();
  await expect(playground.getByRole('tabpanel', { name: 'HTML' })).toContainText('flex flex-col box-border');

  await playground.getByRole('radio', { name: 'Native CSS' }).check();
  await playground.getByRole('button', { name: 'Migrate template' }).click();
  const htmlTab = playground.getByRole('tab', { name: 'HTML' });
  const cssTab = playground.getByRole('tab', { name: 'CSS' });
  await htmlTab.focus();
  await page.keyboard.press('ArrowRight');
  await expect(cssTab).toBeFocused();
  await expect(cssTab).toHaveAttribute('aria-selected', 'true');
  await expect(playground.getByRole('tabpanel', { name: 'CSS' })).toContainText('flex-layout-codemod:start');

  expect(sourceBearingRequests).toEqual([]);
  expect(requestsAfterEditing).toEqual([]);
});

test('disables smooth scrolling and transition motion when reduced motion is requested', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  const motion = await page.getByRole('link', { name: 'Skip to content' }).evaluate(element => {
    const rootStyle = getComputedStyle(document.documentElement);
    const elementStyle = getComputedStyle(element);
    return {
      scrollBehavior: rootStyle.scrollBehavior,
      transitionDuration: elementStyle.transitionDuration,
    };
  });

  expect(motion.scrollBehavior).toBe('auto');
  expect(['0.01ms', '1e-05s']).toContain(motion.transitionDuration);
});

test('stacks the real migration plan without page overflow at 375px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');

  await expect(
    page.getByRole('heading', {
      name: 'Plan first. Review unresolved cases. Write only when you are ready.',
    }),
  ).toBeVisible();
  const hero = page.locator('.migration-plan-hero');
  await page.getByRole('radio', { name: 'Native CSS' }).first().check();
  await expect(hero.getByLabel('Migration HTML output')).toContainText('flm-5db098b5a4e638f');
  await expect(hero.getByLabel('Migration CSS output')).toContainText('flex-layout-codemod:start');

  const diffScroller = hero.getByRole('list', { name: 'Source change summary lines' });
  await diffScroller.focus();
  await expect(diffScroller).toBeFocused();
  expect(
    await diffScroller.evaluate(element => ({
      overflowX: getComputedStyle(element).overflowX,
      overflows: element.scrollWidth > element.clientWidth,
    })),
  ).toEqual({ overflowX: 'auto', overflows: true });

  const heroCodeSizes = await hero
    .locator('code')
    .evaluateAll(elements => elements.map(element => Number.parseFloat(getComputedStyle(element).fontSize)));
  expect(heroCodeSizes.length).toBeGreaterThan(0);
  expect(Math.min(...heroCodeSizes)).toBeGreaterThanOrEqual(14);

  const planColumns = await hero.locator('.migration-plan-hero__body').evaluate(element => {
    const style = getComputedStyle(element);
    return style.gridTemplateColumns.split(' ').length;
  });
  expect(planColumns).toBe(1);
  expect(await page.locator('body').evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(375);
});

test('keeps mobile documentation context visible and wide content locally scrollable', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/docs/compatibility');

  const mobileNavigation = page.getByRole('navigation', { name: 'Mobile documentation' });
  await expect(mobileNavigation).toBeVisible();
  await expect(mobileNavigation.getByRole('link', { name: 'Compatibility overview' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(mobileNavigation.getByText('Compatibility', { exact: true })).toBeVisible();

  const tableScroller = page.locator('.reference-table-scroll');
  await expect(tableScroller).toBeVisible();
  expect(
    await tableScroller.evaluate(element => ({ client: element.clientWidth, scroll: element.scrollWidth })),
  ).toMatchObject({ client: expect.any(Number), scroll: expect.any(Number) });
  expect(await tableScroller.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
  expect(await page.locator('body').evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(375);

  await page.goto('/docs/examples');
  const exampleCode = page.locator('.verified-example .code-block').first();
  await expect(exampleCode).toBeVisible();
  const codeMetrics = await exampleCode.locator('pre').evaluate(element => ({
    fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
    overflowX: getComputedStyle(element).overflowX,
  }));
  expect(codeMetrics.fontSize).toBeGreaterThanOrEqual(14);
  expect(codeMetrics.overflowX).toBe('auto');
  expect(await page.locator('body').evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(375);
});
