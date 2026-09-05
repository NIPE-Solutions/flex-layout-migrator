import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const sourceMarker = 'private-source-marker-4917';

test('renders responsive navigation and follows a direct documentation link', async ({ page }, testInfo) => {
  await page.goto('/docs/tailwind');

  await expect(page.getByRole('heading', { level: 1, name: 'Tailwind CSS output' })).toBeVisible();
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

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter(violation => violation.impact === 'critical')).toEqual([]);
});

test('converts both targets, operates output tabs with arrows, and transmits no editor source', async ({ page }) => {
  const sourceBearingRequests: string[] = [];
  page.on('request', request => {
    const requestEvidence = [request.url(), request.postData() ?? '', JSON.stringify(request.headers())].join('\n');
    if (requestEvidence.includes(sourceMarker)) sourceBearingRequests.push(request.url());
  });

  await page.goto('/');
  const source = page.getByRole('textbox', { name: 'Angular template' });
  await source.fill(`<section id="${sourceMarker}" fxLayout="column"></section>`);
  await page.getByRole('button', { name: 'Migrate template' }).click();
  await expect(page.getByRole('tabpanel', { name: 'HTML' })).toContainText('flex flex-col box-border');

  await page.getByRole('radio', { name: 'Native CSS' }).check();
  await page.getByRole('button', { name: 'Migrate template' }).click();
  const htmlTab = page.getByRole('tab', { name: 'HTML' });
  const cssTab = page.getByRole('tab', { name: 'CSS' });
  await htmlTab.focus();
  await page.keyboard.press('ArrowRight');
  await expect(cssTab).toBeFocused();
  await expect(cssTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: 'CSS' })).toContainText('flex-layout-codemod:start');

  expect(sourceBearingRequests).toEqual([]);
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
