import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const IMPACT_LEVELS = new Set(['critical', 'serious']);

/** @param {import('axe-core').Result[]} violations */
function impactfulViolations(violations) {
	return violations.filter(({ impact }) => (impact ? IMPACT_LEVELS.has(impact) : false));
}

/**
 * The LaTeX pane is now an editable textarea (data-testid="latex-output"), populated
 * once whenReady() resolves and the initial DualDocument finishes building — both
 * panes are `disabled` until then (see +page.svelte). Scanning before that means axe
 * only ever sees the transient disabled/empty DOM, not the app's real, populated state.
 * @param {import('@playwright/test').Page} page
 */
async function waitForAppReady(page) {
	const output = page.getByTestId('latex-output');
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
		const latexPane = page.getByTestId('latex-output');
		const original = await latexPane.inputValue();
		expect(original).toContain('3+4');
		await latexPane.fill(original.replace('3+4', '\\frac{1}{2'));

		await expect(page.getByText(/sync issue/i).first()).toBeVisible({ timeout: 5000 });

		const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();

		expect(impactfulViolations(violations)).toEqual([]);
	});
});
