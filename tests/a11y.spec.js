import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const IMPACT_LEVELS = new Set(['critical', 'serious']);

/** @param {import('axe-core').Result[]} violations */
function impactfulViolations(violations) {
	return violations.filter(({ impact }) => (impact ? IMPACT_LEVELS.has(impact) : false));
}

/**
 * The LaTeX pane is now an editable textarea (data-testid="second-pane-output"), populated
 * once whenReady() resolves and the initial DualDocument finishes building — both
 * panes are `disabled` until then (see +page.svelte). Scanning before that means axe
 * only ever sees the transient disabled/empty DOM, not the app's real, populated state.
 * @param {import('@playwright/test').Page} page
 */
async function waitForAppReady(page) {
	const output = page.getByTestId('second-pane-output');
	await expect(output).toBeEnabled({ timeout: 15000 });
	await expect(output).not.toHaveValue('', { timeout: 15000 });
}

test.describe('Accessibility', () => {
	test('homepage has no critical/serious violations once loaded', async ({ page }) => {
		await page.goto('/');
		await waitForAppReady(page);

		const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();

		expect(impactfulViolations(violations)).toEqual([]);
	});

	test('changing the braille table has no critical/serious violations', async ({ page }) => {
		await page.goto('/');
		await waitForAppReady(page);

		await page.locator('#braille-table').selectOption('en-ueb-g1.ctb');
		await waitForAppReady(page);

		const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();

		expect(impactfulViolations(violations)).toEqual([]);
	});

	test('an active sync issue (broken LaTeX mid-edit) has no critical/serious violations', async ({
		page
	}) => {
		await page.goto('/');
		await waitForAppReady(page);

		// Sample Quiz.brf includes an "_%3+4_:" equation — break its LaTeX so
		// applyLatexEdit() fails and the sync-issues list/aria-live region render
		// with real content, not just their empty state.
		const latexPane = page.getByTestId('second-pane-output');
		const original = await latexPane.inputValue();
		expect(original).toContain('3+4');
		await latexPane.fill(original.replace('3+4', '\\frac{1}{2'));

		await expect(page.getByText(/sync issue/i).first()).toBeVisible({ timeout: 5000 });

		const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();

		expect(impactfulViolations(violations)).toEqual([]);
	});

	test('switching the second pane to Markdown has no critical/serious violations', async ({
		page
	}) => {
		await page.goto('/');
		await waitForAppReady(page);

		await page.selectOption('#second-pane-format', 'markdown');
		await expect(page.locator('h3', { hasText: 'Markdown' })).toBeVisible();

		const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();

		expect(impactfulViolations(violations)).toEqual([]);
	});

	test('an unsupported-Markdown sync issue (from a .md upload) has no critical/serious violations', async ({
		page
	}) => {
		await page.goto('/');
		await waitForAppReady(page);

		const braillePane = page.locator('#braille-text');
		const brailleBefore = await braillePane.inputValue();
		await page.locator('#braille-file').setInputFiles({
			name: 'heading.md',
			mimeType: 'text/markdown',
			buffer: Buffer.from('# A Heading\n\nplain paragraph')
		});
		await expect(braillePane).not.toHaveValue(brailleBefore, { timeout: 15000 });
		await expect(page.locator('section[aria-label="Sync issues"] button').first()).toBeVisible();

		const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();

		expect(impactfulViolations(violations)).toEqual([]);
	});

	test('a Word download in progress has no critical/serious violations', async ({ page }) => {
		await page.goto('/');
		await waitForAppReady(page);

		await page.locator('#word-download').click();
		// Best-effort: catch the mid-flight disabled+aria-busy+status-message
		// state before the conversion resolves. If it resolves too fast to
		// observe, the scan below still runs against whatever state remains —
		// this test's job is to catch a11y violations, not pin down timing.
		await page
			.waitForFunction(
				() => document.querySelector('#word-download')?.getAttribute('disabled') !== null,
				{
					timeout: 3000
				}
			)
			.catch(() => {});

		const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();

		expect(impactfulViolations(violations)).toEqual([]);
	});
});
