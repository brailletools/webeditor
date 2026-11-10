import { describe, test, expect, vi, beforeEach } from 'vitest';

const fromBraille = vi.fn();
const fromMarkdown = vi.fn();
vi.mock('@brailletools/braille-bridge', () => ({
	DualDocument: { fromBraille, fromMarkdown }
}));

beforeEach(() => {
	fromBraille.mockReset();
	fromMarkdown.mockReset();
});

describe('sync.svelte.js loadText error handling', () => {
	test('a rejected DualDocument.fromBraille() surfaces via state.loadError instead of throwing', async () => {
		const { createSyncController } = await import('./sync.svelte.js');
		const sync = createSyncController({ table: 'en-ueb-g2.ctb' });

		fromBraille.mockRejectedValueOnce(new Error('invalid braille content'));

		// Callers like the initial sample load and the .brf/.brl upload branch in
		// +page.svelte call loadText() without awaiting it -- this must never reject.
		await expect(sync.loadText('garbage')).resolves.toBeUndefined();
		expect(sync.state.loadError).toBe('invalid braille content');
		expect(sync.state.ready).toBe(false);
	});

	test('a failed load after a successful one leaves the last-known-good document state untouched', async () => {
		const { createSyncController } = await import('./sync.svelte.js');
		const sync = createSyncController({ table: 'en-ueb-g2.ctb' });

		fromBraille.mockResolvedValueOnce({
			brailleText: 'HELLO',
			latexText: 'hello',
			renderLatex: async () => 'hello',
			errors: []
		});
		await sync.loadText('HELLO');
		expect(sync.state.ready).toBe(true);
		expect(sync.state.loadError).toBe('');

		fromBraille.mockRejectedValueOnce(new Error('boom'));
		await sync.loadText('bad input');

		expect(sync.state.loadError).toBe('boom');
		expect(sync.state.ready).toBe(true); // unchanged, not clobbered by the failed load
	});

	test('a successful load clears a previous loadError', async () => {
		const { createSyncController } = await import('./sync.svelte.js');
		const sync = createSyncController({ table: 'en-ueb-g2.ctb' });

		fromBraille.mockRejectedValueOnce(new Error('boom'));
		await sync.loadText('bad input');
		expect(sync.state.loadError).toBe('boom');

		fromBraille.mockResolvedValueOnce({
			brailleText: 'HELLO',
			latexText: 'hello',
			renderLatex: async () => 'hello',
			errors: []
		});
		await sync.loadText('HELLO');
		expect(sync.state.loadError).toBe('');
		expect(sync.state.ready).toBe(true);
	});
});

describe('sync.svelte.js format switching', () => {
	function makeMockDoc() {
		return {
			brailleText: 'HELLO',
			latexText: 'stale-latex', // never returned directly -- renderSecondPaneText() must call renderLatex()
			renderLatex: vi.fn(async () => 'fresh-latex'),
			renderMarkdown: vi.fn(async () => 'fresh-markdown'),
			errors: []
		};
	}

	test('defaults to latex and renders via renderLatex(), not the .latexText getter, on load', async () => {
		const { createSyncController } = await import('./sync.svelte.js');
		const sync = createSyncController({ table: 'en-ueb-g2.ctb' });
		const doc = makeMockDoc();
		fromBraille.mockResolvedValueOnce(doc);

		await sync.loadText('HELLO');

		expect(sync.state.format).toBe('latex');
		expect(doc.renderLatex).toHaveBeenCalledTimes(1);
		expect(doc.renderMarkdown).not.toHaveBeenCalled();
	});

	test('loadMarkdown() builds via DualDocument.fromMarkdown() and still renders the active format', async () => {
		const { createSyncController } = await import('./sync.svelte.js');
		const sync = createSyncController({ table: 'en-ueb-g2.ctb' });
		const doc = makeMockDoc();
		fromMarkdown.mockResolvedValueOnce(doc);

		await sync.loadMarkdown('**hi**');

		expect(fromMarkdown).toHaveBeenCalledTimes(1);
		expect(sync.state.ready).toBe(true);
		expect(doc.renderLatex).toHaveBeenCalledTimes(1);
	});

	test('setFormat("markdown") re-renders via renderMarkdown() and updates state.format', async () => {
		const { createSyncController } = await import('./sync.svelte.js');
		const sync = createSyncController({ table: 'en-ueb-g2.ctb' });
		const doc = makeMockDoc();
		fromBraille.mockResolvedValueOnce(doc);
		await sync.loadText('HELLO');

		await sync.setFormat('markdown');

		expect(sync.state.format).toBe('markdown');
		expect(doc.renderMarkdown).toHaveBeenCalledTimes(1);
	});

	test('setFormat() with the current format is a no-op (no re-render)', async () => {
		const { createSyncController } = await import('./sync.svelte.js');
		const sync = createSyncController({ table: 'en-ueb-g2.ctb' });
		const doc = makeMockDoc();
		fromBraille.mockResolvedValueOnce(doc);
		await sync.loadText('HELLO');
		doc.renderLatex.mockClear();

		await sync.setFormat('latex');

		expect(doc.renderLatex).not.toHaveBeenCalled();
	});
});

describe('sync.svelte.js lines-are-paragraphs option', () => {
	function mockDoc(text = 'AA\nBB') {
		return {
			brailleText: text,
			latexText: 'x',
			renderLatex: async () => 'x',
			renderMarkdown: async () => 'x',
			errors: []
		};
	}
	/** @param {string} value */
	const fakeEl = (value) => ({ value, setSelectionRange() {}, selectionStart: 0 });

	test('defaults to off and is passed to both loaders', async () => {
		const { createSyncController } = await import('./sync.svelte.js');
		const sync = createSyncController({ table: 'en-ueb-g2.ctb' });
		expect(sync.state.linesAreParagraphs).toBe(false);

		fromBraille.mockResolvedValue(mockDoc());
		await sync.loadText('AA');
		expect(fromBraille.mock.lastCall?.[1]?.linesAreParagraphs).toBe(false);

		fromMarkdown.mockResolvedValue(mockDoc());
		await sync.loadMarkdown('# hi');
		expect(fromMarkdown.mock.lastCall?.[1]?.linesAreParagraphs).toBe(false);
	});

	test('turning it on rebuilds the document from the braille pane text with the option set, and later loads keep it', async () => {
		const { createSyncController } = await import('./sync.svelte.js');
		const sync = createSyncController({ table: 'en-ueb-g2.ctb' });
		const brailleEl = fakeEl('AA\nBB');
		sync.setBrailleEl(brailleEl);
		sync.setSecondEl(fakeEl(''));

		fromBraille.mockResolvedValue(mockDoc());
		await sync.loadText('AA\nBB');
		fromBraille.mockClear();

		await sync.setLinesAreParagraphs(true);
		expect(sync.state.linesAreParagraphs).toBe(true);
		expect(fromBraille).toHaveBeenCalledTimes(1);
		expect(fromBraille.mock.calls[0][0]).toBe('AA\nBB'); // the pane's own text, untouched
		expect(fromBraille.mock.calls[0][1].linesAreParagraphs).toBe(true);

		// A later upload goes through loadText() and must keep the setting.
		await sync.loadText('CC');
		expect(fromBraille.mock.lastCall?.[1]?.linesAreParagraphs).toBe(true);
	});

	test('setting the value it already has does not rebuild anything', async () => {
		const { createSyncController } = await import('./sync.svelte.js');
		const sync = createSyncController({ table: 'en-ueb-g2.ctb' });
		sync.setBrailleEl(fakeEl('AA'));
		sync.setSecondEl(fakeEl(''));
		fromBraille.mockResolvedValue(mockDoc());
		await sync.loadText('AA');
		fromBraille.mockClear();
		await sync.setLinesAreParagraphs(false);
		expect(fromBraille).not.toHaveBeenCalled();
	});

	test('if the rebuild fails, the old setting and last-known-good document are kept', async () => {
		const { createSyncController } = await import('./sync.svelte.js');
		const sync = createSyncController({ table: 'en-ueb-g2.ctb' });
		sync.setBrailleEl(fakeEl('AA'));
		sync.setSecondEl(fakeEl(''));
		fromBraille.mockResolvedValueOnce(mockDoc());
		await sync.loadText('AA');

		fromBraille.mockRejectedValueOnce(new Error('boom'));
		await sync.setLinesAreParagraphs(true);
		expect(sync.state.linesAreParagraphs).toBe(false); // reverted
		expect(sync.state.loadError).toBe('boom');
		expect(sync.state.ready).toBe(true);
	});
});
