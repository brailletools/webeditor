// @ts-nocheck
// Bidirectional braille<->(LaTeX|Markdown) sync orchestration for the two
// editable panes. The second pane's format is user-selectable (see
// state.format / setFormat()) — LaTeX and Markdown are otherwise handled
// symmetrically throughout this file. Uses runes (Svelte 5), so this file
// needs the .svelte.js extension rather than plain .js — see
// https://svelte.dev/docs/svelte/svelte-js-files.
//
// Design constraints this file exists to satisfy (see the side-by-side sync
// plan, and the "Round-trip fidelity"/"Formats are rederived lazily" notes in
// the webeditor Markdown/Word planning doc):
//  - Translation only ever runs from an explicit oninput handler, never from
//    reactive ($derived) plumbing, so there's no risk of the reactive-loop bug the
//    old single-direction preview had.
//  - The pane a user is actively typing in is never overwritten by a background
//    sync; the *other* pane's DOM is only ever touched imperatively (via element
//    refs), never through a reactive `value={...}` binding, so Svelte's renderer
//    can't fight a manual setSelectionRange() call.
//  - doc.applyBrailleEdit()/doc.applyLatexEdit()/doc.applyMarkdownEdit() are
//    serialized through a single promise chain (mutationChain) so two
//    overlapping in-flight translations (e.g. the user tabs to the other pane
//    and starts typing before the first one resolves) can never mutate the
//    shared DualDocument concurrently.
//  - Markdown is never eagerly kept in sync the way LaTeX is (braille-bridge's
//    DualDocument only auto-updates .latexText on every braille edit) —
//    switching the second pane's format to Markdown, or loading a document,
//    triggers a one-shot renderMarkdown() call here, not a standing
//    subscription. See DualDocument's doc comments for why.

import { DualDocument } from '@brailletools/braille-bridge';

const DEBOUNCE_MS = 250;

export function createSyncController({ table: initialTable, translate, translateForward } = {}) {
	let table = initialTable;
	const state = $state({
		format: 'latex', // 'latex' | 'markdown' — which format the second pane shows
		issues: [],
		ready: false,
		loadError: ''
	});

	let doc = null;
	let brailleEl = null;
	let secondEl = null;

	let brailleRevision = 0;
	let secondRevision = 0;
	let brailleDebounceId = null;
	let secondDebounceId = null;
	let mutationChain = Promise.resolve();

	// Queued because the target pane had focus when the update was ready; applied
	// on that pane's blur instead of clobbering an in-progress edit/cursor there.
	let pendingForBraille = null;
	let pendingForSecond = null;

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

	function deliverToSecond(value, cursor) {
		if (document.activeElement === secondEl) {
			pendingForSecond = { value, cursor };
		} else {
			writeToPane(secondEl, value, cursor);
		}
	}

	// Computes the text to display in the second pane for whichever format is
	// currently active. Always a fresh one-shot render (renderLatex()/
	// renderMarkdown()), never the .latexText/.markdownText getters directly —
	// either can be stale here, since an edit made through the *other* format's
	// pane only updates that other format (see DualDocument's doc comments on
	// applyLatexEdit()/applyMarkdownEdit()).
	async function renderSecondPaneText(targetDoc) {
		return state.format === 'markdown'
			? await targetDoc.renderMarkdown()
			: await targetDoc.renderLatex();
	}

	// Shared tail of loadText()/loadMarkdown(): once a new DualDocument has been
	// built (however its source format got there), push braille + the current
	// second-pane format into both panes. A whole-document replacement, not an
	// incremental edit — no focus-guard subtlety needed, both panes are simply
	// overwritten (matches handleTableChange()'s existing "equivalent to a
	// fresh load" pattern in +page.svelte).
	async function finishLoad(newDoc, newTable) {
		if (newTable) table = newTable;
		doc = newDoc;
		state.loadError = '';
		refreshIssues();
		writeToPane(brailleEl, doc.brailleText);
		writeToPane(secondEl, await renderSecondPaneText(doc));
		state.ready = true;
	}

	/**
	 * (Re)build the document from braille source and push it into both panes —
	 * used for the initial sample load, the .brf/.brl upload branch, and table
	 * changes.
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
		await finishLoad(newDoc, newTable);
	}

	/**
	 * (Re)build the document from Markdown source — an uploaded .md file
	 * directly, or the result of running an uploaded .tex/.docx through Pandoc
	 * first (see +page.svelte's upload dispatch). Braille is still derived and
	 * still ground truth afterward; this only differs from loadText() in how
	 * the initial braille got there.
	 */
	async function loadMarkdown(text, newTable) {
		let newDoc;
		try {
			newDoc = await DualDocument.fromMarkdown(text, {
				table: newTable ?? table,
				translate,
				translateForward
			});
		} catch (error) {
			state.loadError = error?.message ?? String(error);
			return;
		}
		await finishLoad(newDoc, newTable);
	}

	/**
	 * Switches which format the second pane displays. A full rebuild of that
	 * pane's content from the current document (same cost/shape as a fresh
	 * load), not an incremental update — see the module doc comment.
	 */
	async function setFormat(newFormat) {
		if (newFormat === state.format) return;
		state.format = newFormat;
		if (!doc) return;
		writeToPane(secondEl, await renderSecondPaneText(doc));
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
				let secondText = latexText;
				let secondCursor = latexCursor;
				if (state.format === 'markdown') {
					secondText = await doc.renderMarkdown();
					secondCursor = doc.mapCursor('brailleRange', 'markdownRange', cursor);
				}
				refreshIssues();
				if (myRevision !== brailleRevision) return; // superseded by newer typing in this pane
				deliverToSecond(secondText, secondCursor);
			});
		}, DEBOUNCE_MS);
	}

	function handleSecondInput(event) {
		const value = event.target.value;
		const cursor = event.target.selectionStart;
		const myRevision = ++secondRevision;
		const format = state.format; // captured at keystroke time, not delivery time

		clearTimeout(secondDebounceId);
		secondDebounceId = setTimeout(() => {
			runMutation(async () => {
				if (!doc) return;
				const { brailleText, brailleCursor } =
					format === 'markdown'
						? await doc.applyMarkdownEdit(value, cursor)
						: await doc.applyLatexEdit(value, cursor);
				refreshIssues();
				if (myRevision !== secondRevision) return;
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

	function handleSecondBlur() {
		if (pendingForSecond) {
			writeToPane(secondEl, pendingForSecond.value, pendingForSecond.cursor);
			pendingForSecond = null;
		}
	}

	/**
	 * Used by the sync-issues list: focus the owning pane and select the node's
	 * range. `pane` is the coordinate system `range` is expressed in
	 * ('braille' | 'latex' | 'markdown') — for 'braille' or whichever format is
	 * currently displayed in the second pane, that's already the visible
	 * pane's own coordinates, *if* that range has actually been computed
	 * (`range` can be null — e.g. a Markdown-import-time issue flagged before
	 * Markdown was ever rendered for this document, since renderMarkdown() is
	 * lazy). Whenever `range` isn't directly usable — a cross-pane mismatch,
	 * or a null range — fall back to `brailleRange`, which DualDocument.errors
	 * always populates regardless of which format has been rendered.
	 */
	function focusNode(pane, range, brailleRange) {
		if (range && (pane === 'braille' || pane === state.format)) {
			const el = pane === 'braille' ? brailleEl : secondEl;
			if (el) {
				el.focus();
				el.setSelectionRange(range.start, range.end);
				return;
			}
		}
		if (!brailleEl || !brailleRange) return;
		brailleEl.focus();
		brailleEl.setSelectionRange(brailleRange.start, brailleRange.end);
	}

	/**
	 * Moves focus to the other pane (braille <-> the current second-pane
	 * format), placing the caret at the corresponding location — the
	 * "jump to corresponding location" keyboard shortcut. Best-effort
	 * proportional mapping (see DualDocument.mapCursor()'s doc comment), same
	 * as the mapping already used to keep the two panes' cursors in sync while
	 * typing.
	 */
	function jumpToOtherPane(fromPane) {
		if (!doc) return;
		if (fromPane === 'braille') {
			if (!brailleEl || !secondEl) return;
			const offset = doc.mapCursor(
				'brailleRange',
				state.format === 'markdown' ? 'markdownRange' : 'latexRange',
				brailleEl.selectionStart
			);
			secondEl.focus();
			secondEl.setSelectionRange(offset, offset);
		} else {
			if (!brailleEl || !secondEl) return;
			const offset = doc.mapCursor(
				state.format === 'markdown' ? 'markdownRange' : 'latexRange',
				'brailleRange',
				secondEl.selectionStart
			);
			brailleEl.focus();
			brailleEl.setSelectionRange(offset, offset);
		}
	}

	return {
		state,
		setBrailleEl: (el) => {
			brailleEl = el;
		},
		setSecondEl: (el) => {
			secondEl = el;
		},
		loadText,
		loadMarkdown,
		setFormat,
		handleBrailleInput,
		handleSecondInput,
		handleBrailleBlur,
		handleSecondBlur,
		focusNode,
		jumpToOtherPane,
		getDoc: () => doc,
		// For failures that happen upstream of loadText()/loadMarkdown() (e.g. a
		// Pandoc conversion failing during .tex/.docx upload, before there's any
		// Markdown to hand to loadMarkdown()) but that are still, from the
		// user's perspective, "this document failed to load" — reuses the same
		// state.loadError display rather than +page.svelte needing a second,
		// separate error slot for what's conceptually the same failure category.
		setLoadError: (message) => {
			state.loadError = message;
		}
	};
}
