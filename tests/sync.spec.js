// @ts-nocheck
import { test, expect } from '@playwright/test';

/** @param {import('@playwright/test').Page} page */
async function waitForAppReady(page) {
	const output = page.getByTestId('latex-output');
	await expect(output).toBeEnabled({ timeout: 15000 });
	await expect(output).not.toHaveValue('', { timeout: 15000 });
}

/**
 * Uploads an in-memory .brf fixture so tests can start from known, small content
 * instead of the full Sample Quiz.brf (whose exact back-translated wording depends
 * on the liblouis table and isn't worth pinning down here).
 * @param {import('@playwright/test').Page} page
 * @param {string} content
 */
async function uploadBrf(page, content) {
	await page.locator('#braille-file').setInputFiles({
		name: 'fixture.brf',
		mimeType: 'text/plain',
		buffer: Buffer.from(content)
	});
	await waitForAppReady(page);
}

const DEBOUNCE_SETTLE_MS = 600; // > sync.svelte.js's 250ms debounce, plus translation time

test.describe('Bidirectional sync', () => {
	test('editing the braille pane updates the LaTeX pane', async ({ page }) => {
		await page.goto('/');
		await uploadBrf(page, 'HELLO\n\nWORLD');

		const braillePane = page.locator('#braille-text');
		const latexPane = page.getByTestId('latex-output');
		const latexBefore = await latexPane.inputValue();

		// Append inside the second paragraph only, well clear of the paragraph break.
		const current = await braillePane.inputValue();
		await braillePane.fill(current + 'THERE');
		await page.waitForTimeout(DEBOUNCE_SETTLE_MS);

		await expect(latexPane).not.toHaveValue(latexBefore);
	});

	test('editing an equation in the LaTeX pane updates the braille pane via latex_to_nemeth', async ({
		page
	}) => {
		await page.goto('/');
		await uploadBrf(page, '_%3+4_:');

		const braillePane = page.locator('#braille-text');
		const latexPane = page.getByTestId('latex-output');
		const brailleBefore = await braillePane.inputValue();

		const latexBefore = await latexPane.inputValue();
		expect(latexBefore).toContain('3+4');
		await latexPane.fill(latexBefore.replace('3+4', '5+6'));
		await page.waitForTimeout(DEBOUNCE_SETTLE_MS);

		await expect(braillePane).not.toHaveValue(brailleBefore);
	});

	test('a broken equation edit surfaces a sync issue without corrupting the braille pane, then clears once fixed', async ({
		page
	}) => {
		await page.goto('/');
		await uploadBrf(page, '_%3+4_:');

		const braillePane = page.locator('#braille-text');
		const latexPane = page.getByTestId('latex-output');
		const brailleBefore = await braillePane.inputValue();
		const latexBefore = await latexPane.inputValue();

		await latexPane.fill(latexBefore.replace('3+4', '\\frac{1}{2'));
		await expect(page.getByText(/sync issue/i).first()).toBeVisible({ timeout: 5000 });
		await expect(braillePane).toHaveValue(brailleBefore);

		await latexPane.fill(latexBefore.replace('3+4', '\\frac{1}{2}'));
		await expect(page.getByRole('region', { name: 'Sync issues' })).toContainText(
			'No sync issues',
			{
				timeout: 5000
			}
		);
		await expect(braillePane).not.toHaveValue(brailleBefore);
	});

	test('typing in the LaTeX pane is never overwritten by a pending braille-side update while focused', async ({
		page
	}) => {
		await page.goto('/');
		await uploadBrf(page, 'HELLO\n\nWORLD');

		const braillePane = page.locator('#braille-text');
		const latexPane = page.getByTestId('latex-output');

		// Kick off a braille edit (schedules a debounced -> latex update), then
		// immediately move focus into the LaTeX pane and type there before that
		// update can land.
		const current = await braillePane.inputValue();
		await braillePane.fill(current + 'X');

		await latexPane.click();
		await latexPane.press('End');
		await page.keyboard.type(' typed while focused');
		const duringFocusValue = await latexPane.inputValue();
		expect(duringFocusValue.endsWith(' typed while focused')).toBe(true);

		// Give the queued braille->latex update time to arrive; it must not have
		// clobbered the pane while it was focused.
		await page.waitForTimeout(DEBOUNCE_SETTLE_MS);
		await expect(latexPane).toHaveValue(duringFocusValue);

		// Blurring should now apply the queued update.
		await braillePane.click();
		await page.waitForTimeout(DEBOUNCE_SETTLE_MS);
		const afterBlurValue = await latexPane.inputValue();
		expect(afterBlurValue).not.toBe(duringFocusValue);
	});
});
