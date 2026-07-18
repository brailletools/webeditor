import { describe, test, expect, vi, beforeEach } from 'vitest';

const fromBraille = vi.fn();
vi.mock('@brailletools/braille2latex', () => ({
	DualDocument: { fromBraille }
}));

beforeEach(() => {
	fromBraille.mockReset();
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

		fromBraille.mockResolvedValueOnce({ brailleText: 'HELLO', latexText: 'hello', errors: [] });
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

		fromBraille.mockResolvedValueOnce({ brailleText: 'HELLO', latexText: 'hello', errors: [] });
		await sync.loadText('HELLO');
		expect(sync.state.loadError).toBe('');
		expect(sync.state.ready).toBe(true);
	});
});
