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
