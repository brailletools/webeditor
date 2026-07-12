import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// NOTE: these currently fail — the app gets stuck on "Initializing..." because the
// braille2latex version checked out on main's configure() API (npm `liblouis` import)
// doesn't match what +page.svelte calls (globalThis.liblouis + liblouisTablesUrl, from
// the unmerged braille2latex commit b32a738). Resolve that branch mismatch first.

const IMPACT_LEVELS = new Set(['critical', 'serious']);

function impactfulViolations(violations) {
	return violations.filter(({ impact }) => (impact ? IMPACT_LEVELS.has(impact) : false));
}

async function waitForAppReady(page) {
	// The output panel shows "Initializing..." while the liblouis worker boots, then
	// "Processing..." while the sample text parses. Scanning before either resolves means
	// axe only ever sees the transient loading DOM, not the app's real, populated state.
	const output = page.getByTestId('latex-output');
	await expect(output).not.toContainText('Initializing...', { timeout: 15000 });
	await expect(output).not.toContainText('Processing...', { timeout: 15000 });
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
});
