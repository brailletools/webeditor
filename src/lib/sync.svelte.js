// @ts-nocheck
// Bidirectional braille<->LaTeX sync orchestration for the two editable panes.
// Uses runes (Svelte 5), so this file needs the .svelte.js extension rather than
// plain .js — see https://svelte.dev/docs/svelte/svelte-js-files.
//
// Design constraints this file exists to satisfy (see the side-by-side sync plan):
//  - Translation only ever runs from an explicit oninput handler, never from
//    reactive ($derived) plumbing, so there's no risk of the reactive-loop bug the
//    old single-direction preview had.
//  - The pane a user is actively typing in is never overwritten by a background
//    sync; the *other* pane's DOM is only ever touched imperatively (via element
//    refs), never through a reactive `value={...}` binding, so Svelte's renderer
//    can't fight a manual setSelectionRange() call.
//  - doc.applyBrailleEdit()/doc.applyLatexEdit() are serialized through a single
//    promise chain (mutationChain) so two overlapping in-flight translations (e.g.
//    the user tabs to the other pane and starts typing before the first one
//    resolves) can never mutate the shared DualDocument concurrently.

import { DualDocument } from '@brailletools/braille2latex';

const DEBOUNCE_MS = 250;

export function createSyncController({ table: initialTable, translate, translateForward } = {}) {
	let table = initialTable;
	const state = $state({
		issues: [],
		ready: false,
		loadError: ''
	});

	let doc = null;
	let brailleEl = null;
	let latexEl = null;

	let brailleRevision = 0;
	let latexRevision = 0;
	let brailleDebounceId = null;
	let latexDebounceId = null;
	let mutationChain = Promise.resolve();

	// Queued because the target pane had focus when the update was ready; applied
	// on that pane's blur instead of clobbering an in-progress edit/cursor there.
	let pendingForBraille = null;
	let pendingForLatex = null;

	function runMutation(fn) {
		const result = mutationChain.then(fn);
		mutationChain = result.then(
			() => {},
			() => {} // never let a rejected translation break the queue for later edits
		);
		return result;
	}

	function refreshIssues() {
		state.issues = doc ? doc.errors : [];
	}

	function writeToPane(el, value, cursor) {
		if (!el) return;
		el.value = value;
		if (typeof cursor === 'number') el.setSelectionRange(cursor, cursor);
	}

	// The braille pane is edited directly in ASCII (NABCC) — the same format
	// DualDocument works in internally — so no display-layer transform is needed
	// at this boundary; writeToPane() above is sufficient.
	function deliverToBraille(asciiValue, cursor) {
		if (document.activeElement === brailleEl) {
			pendingForBraille = { value: asciiValue, cursor };
		} else {
			writeToPane(brailleEl, asciiValue, cursor);
		}
	}

	function deliverToLatex(value, cursor) {
		if (document.activeElement === latexEl) {
			pendingForLatex = { value, cursor };
		} else {
			writeToPane(latexEl, value, cursor);
		}
	}

	/**
	 * (Re)build the document from scratch and push it into both panes — used for
	 * the initial load and for "load a new file", both of which are explicit,
	 * whole-document replacements rather than incremental edits, so there's no
	 * focus-guard subtlety here: both panes are simply overwritten.
	 */
	async function loadText(text, newTable) {
		// Callers invoke this from effects and event handlers, some without awaiting
		// (the initial sample load, the .brf/.brl upload branch) -- an unhandled
		// rejection here would otherwise surface nowhere. Build the new document
		// before committing anything, so a failure (invalid content, liblouis
		// failure) leaves the last-known-good doc/panes/table untouched instead of
		// leaving state.ready stuck or the panes out of sync with `table`.
		let newDoc;
		try {
			newDoc = await DualDocument.fromBraille(text, {
				table: newTable ?? table,
				translate,
				translateForward
			});
		} catch (error) {
			state.loadError = error?.message ?? String(error);
			return;
		}
		if (newTable) table = newTable;
		doc = newDoc;
		state.loadError = '';
		refreshIssues();
		writeToPane(brailleEl, doc.brailleText);
		writeToPane(latexEl, doc.latexText);
		state.ready = true;
	}

	function handleBrailleInput(event) {
		const value = event.target.value;
		const cursor = event.target.selectionStart;
		const myRevision = ++brailleRevision;

		clearTimeout(brailleDebounceId);
		brailleDebounceId = setTimeout(() => {
			runMutation(async () => {
				if (!doc) return;
				const { latexText, latexCursor } = await doc.applyBrailleEdit(value, cursor);
				refreshIssues();
				if (myRevision !== brailleRevision) return; // superseded by newer typing in this pane
				deliverToLatex(latexText, latexCursor);
			});
		}, DEBOUNCE_MS);
	}

	function handleLatexInput(event) {
		const value = event.target.value;
		const cursor = event.target.selectionStart;
		const myRevision = ++latexRevision;

		clearTimeout(latexDebounceId);
		latexDebounceId = setTimeout(() => {
			runMutation(async () => {
				if (!doc) return;
				const { brailleText, brailleCursor } = await doc.applyLatexEdit(value, cursor);
				refreshIssues();
				if (myRevision !== latexRevision) return;
				deliverToBraille(brailleText, brailleCursor);
			});
		}, DEBOUNCE_MS);
	}

	function handleBrailleBlur() {
		if (pendingForBraille) {
			writeToPane(brailleEl, pendingForBraille.value, pendingForBraille.cursor);
			pendingForBraille = null;
		}
	}

	function handleLatexBlur() {
		if (pendingForLatex) {
			writeToPane(latexEl, pendingForLatex.value, pendingForLatex.cursor);
			pendingForLatex = null;
		}
	}

	/** Used by the sync-issues list: focus the owning pane and select the node's range. */
	function focusNode(pane, range) {
		const el = pane === 'latex' ? latexEl : brailleEl;
		if (!el || !range) return;
		el.focus();
		el.setSelectionRange(range.start, range.end);
	}

	return {
		state,
		setBrailleEl: (el) => {
			brailleEl = el;
		},
		setLatexEl: (el) => {
			latexEl = el;
		},
		loadText,
		handleBrailleInput,
		handleLatexInput,
		handleBrailleBlur,
		handleLatexBlur,
		focusNode,
		getDoc: () => doc
	};
}
