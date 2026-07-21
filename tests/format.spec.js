// @ts-nocheck
import { test, expect } from '@playwright/test';

/** @param {import('@playwright/test').Page} page */
async function waitForAppReady(page) {
	const output = page.getByTestId('second-pane-output');
	await expect(output).toBeEnabled({ timeout: 15000 });
	await expect(output).not.toHaveValue('', { timeout: 15000 });
}

const DEBOUNCE_SETTLE_MS = 600; // > sync.svelte.js's 250ms debounce, plus translation time

test.describe('Second-pane format switching', () => {
	test('switching to Markdown and back to LaTeX does not lose or corrupt content', async ({
		page
	}) => {
		await page.goto('/');
		await waitForAppReady(page);

		const secondPane = page.getByTestId('second-pane-output');
		const latexBefore = await secondPane.inputValue();

		await page.selectOption('#second-pane-format', 'markdown');
		await expect(page.locator('h3', { hasText: 'Markdown' })).toBeVisible();
		const markdownValue = await secondPane.inputValue();
		expect(markdownValue.length).toBeGreaterThan(0);

		await page.selectOption('#second-pane-format', 'latex');
		await expect(page.locator('h3', { hasText: 'LaTeX' })).toBeVisible();
		await expect(secondPane).toHaveValue(latexBefore);
	});

	test('editing the Markdown pane updates braille, and switching back to LaTeX reflects that edit (not stale)', async ({
		page
	}) => {
		await page.goto('/');
		await waitForAppReady(page);

		await page.selectOption('#second-pane-format', 'markdown');
		const secondPane = page.getByTestId('second-pane-output');
		const braillePane = page.locator('#braille-text');
		const brailleBefore = await braillePane.inputValue();

		await secondPane.click();
		await secondPane.press('End');
		await page.keyboard.type(' addedviamarkdown');
		await page.waitForTimeout(DEBOUNCE_SETTLE_MS);
		await expect(braillePane).not.toHaveValue(brailleBefore);

		// Regression test: DualDocument.applyMarkdownEdit() only updates
		// .markdown, not .latex -- the LaTeX pane must be freshly rendered
		// (renderLatex()) on switch, not read from a possibly-stale getter.
		// Note: toHaveValue (not toContainText) -- a <textarea>'s .value isn't
		// reflected in .textContent, so toContainText would always see "".
		await page.selectOption('#second-pane-format', 'latex');
		await expect(secondPane).toHaveValue(/addedviamarkdown/, { timeout: 5000 });
	});

	test('uploading a Markdown (.md) file loads it as a starting document', async ({ page }) => {
		await page.goto('/');
		await waitForAppReady(page);

		const braillePane = page.locator('#braille-text');
		const brailleBefore = await braillePane.inputValue();

		await page.locator('#braille-file').setInputFiles({
			name: 'upload.md',
			mimeType: 'text/markdown',
			buffer: Buffer.from('plain **bold** text')
		});
		// waitForAppReady() alone doesn't prove a *re*-load landed: the pane
		// stays enabled and non-empty (the old sample content) the whole time
		// a re-load is in flight, so that helper can't detect this transition
		// on its own -- wait for the content to actually differ from before.
		await expect(braillePane).not.toHaveValue(brailleBefore, { timeout: 15000 });

		const braille = await braillePane.inputValue();
		expect(braille).toMatch(/_\.[^_]*_\./); // BOLD markers
	});

	test('an unsupported Markdown construct on upload is flagged, not silently dropped, and "go to" navigates to it', async ({
		page
	}) => {
		await page.goto('/');
		await waitForAppReady(page);

		const braillePane = page.locator('#braille-text');
		const brailleBefore = await braillePane.inputValue();

		await page.locator('#braille-file').setInputFiles({
			name: 'upload.md',
			mimeType: 'text/markdown',
			buffer: Buffer.from('# A Heading\n\nplain paragraph')
		});
		// Not asserting on exact braille content here: with real UEB Grade 2
		// translation "Heading" is *contracted* (e.g. part of it collapses to
		// a single cell), not spelled out literally -- "translated directly,
		// not dropped" is proven by the content actually changing (below) plus
		// the sync-issue banner confirming this paragraph was processed
		// (checked further down), not by the literal word surviving.
		await expect(braillePane).not.toHaveValue(brailleBefore, { timeout: 15000 });

		const issueButton = page.locator('section[aria-label="Sync issues"] button').first();
		await expect(issueButton).toBeVisible();
		await expect(issueButton).toContainText('Markdown pane');

		await issueButton.click();
		const isBrailleFocused = await page.evaluate(
			() => document.activeElement === document.querySelector('#braille-text')
		);
		expect(isBrailleFocused).toBe(true);
	});

	test('Ctrl+Alt+J jumps focus to the corresponding location in the other pane, and back', async ({
		page
	}) => {
		await page.goto('/');
		await waitForAppReady(page);

		const braillePane = page.locator('#braille-text');
		const secondPane = page.getByTestId('second-pane-output');

		await braillePane.click();
		await braillePane.evaluate((el) => el.setSelectionRange(3, 3));
		await page.keyboard.press('Control+Alt+j');

		const secondFocused = await page.evaluate(
			() => document.activeElement === document.querySelector('[data-testid="second-pane-output"]')
		);
		expect(secondFocused).toBe(true);

		await page.keyboard.press('Control+Alt+j');
		const brailleFocused = await page.evaluate(
			() => document.activeElement === document.querySelector('#braille-text')
		);
		expect(brailleFocused).toBe(true);
	});

	test('uploading a LaTeX (.tex) file loads it as a starting document via Pandoc', async ({
		page
	}) => {
		test.slow(); // first Pandoc use lazy-loads a ~56MB wasm binary
		await page.goto('/');
		await waitForAppReady(page);

		const braillePane = page.locator('#braille-text');
		const brailleBefore = await braillePane.inputValue();

		await page.locator('#braille-file').setInputFiles({
			name: 'upload.tex',
			mimeType: 'text/x-tex',
			buffer: Buffer.from('\\textbf{Hello} World')
		});
		await expect(braillePane).not.toHaveValue(brailleBefore, { timeout: 45000 });

		const braille = await braillePane.inputValue();
		expect(braille).toMatch(/_\.[^_]*_\./); // BOLD markers, from \textbf{Hello}
	});
});
