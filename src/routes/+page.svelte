<script>
	// @ts-nocheck
	import sample from '$lib/Sample Quiz.brf?raw';
	import {
		handleFileChange,
		downloadText,
		wrapLatexDocument,
		isCompleteLatexDocument,
		compileToHTML
	} from '$lib/helper.js';
	import { configure, whenReady, braille2Ascii } from '@brailletools/braille2latex';
	import { runOcr } from '$lib/ocr/ocrClient.js';
	import { createSyncController } from '$lib/sync.svelte.js';
	import SyncIssues from '$lib/components/SyncIssues.svelte';

	import { base } from '$app/paths';

	// easy-api.js prepends window.location.origin + "/" before calling importScripts,
	// so paths must NOT start with "/" or the worker gets origin + "//path" (double-slash).
	// Strip any leading slash; at the site root base is '/' so basePath becomes ''.
	const basePath = (base === '/' ? '' : base).replace(/^\//, '');
	const liblouisBase = basePath ? `${basePath}/liblouis` : 'liblouis';

	// The exact build filename/variant isn't fixed (depends on what the pinned
	// upstream commit ships) — discover it from manifest.json, written by
	// liblouis-fetch-web (@brailletools/liblouis-env-web) alongside the assets.
	const manifest = await fetch(`${liblouisBase}/manifest.json`).then((r) => r.json());
	const capi_url = `${liblouisBase}/${manifest.buildFile}`;
	const easyapi_url = `${liblouisBase}/${manifest.easyApiFile}`;
	const tables_url = manifest.tablesDir ? `${liblouisBase}/${manifest.tablesDir}/` : null;

	// Give the braille2latex package its liblouis URLs
	configure({
		liblouisCapiUrl: capi_url,
		liblouisEasyApiUrl: easyapi_url,
		liblouisTablesUrl: tables_url
	});

	const brailleTables = [
		{ value: 'en-ueb-g2.ctb', label: 'English UEB Grade 2' },
		{ value: 'en-ueb-g1.ctb', label: 'English UEB Grade 1' },
		{ value: 'en-ueb-math.ctb', label: 'English UEB Math' }
	];

	let filename = $state('example_filename.tex');
	let selectedTable = $state(brailleTables[0].value);

	let brailleEl = $state(null);
	let latexEl = $state(null);

	// Only used as the initial table before the first load — intentionally not
	// reactive; later table changes go through handleTableChange() -> loadText(),
	// which explicitly passes the new table.
	const sync = createSyncController({ table: selectedTable });

	// configure() (above) already constructs and initializes the liblouis Worker;
	// whenReady() resolves once that's done.
	let liblouisReady = $state(false);
	whenReady()
		.then(() => {
			liblouisReady = true;
		})
		.catch((error) => {
			console.error('[liblouis] Initialization failed', error);
		});

	// The initial document can only be built (it needs liblouis) and pushed into
	// both panes once liblouis is ready AND the textarea refs exist — whenReady()
	// can resolve before $effect has had a chance to run bind:this into the sync
	// controller, so gate the initial load on both rather than firing it from the
	// whenReady() promise directly.
	let loaded = false;
	$effect(() => {
		sync.setBrailleEl(brailleEl);
		sync.setLatexEl(latexEl);
		if (brailleEl && latexEl && liblouisReady && !loaded) {
			loaded = true;
			sync.loadText(sample);
		}
	});

	async function handleTableChange() {
		if (!brailleEl || !sync.state.ready) return;
		// Rebuild from the braille pane's current content under the new table —
		// equivalent to a fresh load, not an incremental edit.
		await sync.loadText(brailleEl.value, selectedTable);
	}

	const authorizedExtensions = ['.brf', '.brl'];

	// HTML conversion state
	let htmlLoading = $state(false);
	let htmlError = $state('');

	// Photo OCR state (only used when the uploaded file(s) are images, not braille text)
	let ocrLoading = $state(false);
	let ocrError = $state('');
	let ocrStage = $state('');
	let ocrPageProgress = $state('');

	const ocrStageLabels = {
		decoding: 'Reading photo…',
		detecting: 'Finding braille cells…',
		classifying: 'Reading dot patterns…'
	};

	/** @param {File} file */
	function isBrailleTextFile(file) {
		const name = file.name.toLowerCase();
		return authorizedExtensions.some((ext) => name.endsWith(ext));
	}

	// One input, dispatched by file extension: .brf/.brl load as braille text,
	// anything else (photos) run through OCR — the file itself already says
	// which path applies, so there's no need to ask the user to pick a control.
	// Multiple photos are treated as consecutive pages of the same braille
	// document (a physical braille page holds far less text than print, so a
	// document routinely spans several photographed pages) — sorted by
	// filename rather than selection order, since click order in the OS file
	// picker isn't guaranteed to match page order but sequential photo names
	// (IMG_3153, IMG_3154, ...) usually do.
	async function handleUpload(event) {
		const files = Array.from(event.target.files ?? []);
		event.target.value = ''; // allow re-selecting the same file(s) later
		if (!files.length || !sync.state.ready) return;

		// Clear any previous OCR status/error when starting a new upload (text or images).
		ocrError = '';
		ocrStage = '';
		ocrPageProgress = '';

		const textFile = files.find(isBrailleTextFile);
		if (textFile) {
			handleFileChange({ target: { files: [textFile] } }, (result, fname) => {
				void sync
					.loadText(result)
					.then(() => {
						filename = fname.split('.').slice(0, -1).join('.') + '.tex';
					})
					.catch((err) => {
						ocrError = err instanceof Error ? err.message : String(err);
					});
			});
			return;
		}

		const pages = files.sort((a, b) =>
			a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
		);

		ocrError = '';
		ocrStage = '';
		ocrPageProgress = '';
		ocrLoading = true;
		try {
			const pageTexts = [];
			for (let i = 0; i < pages.length; i++) {
				ocrPageProgress = pages.length > 1 ? `Page ${i + 1} of ${pages.length}: ` : '';
				const unicodeBraille = await runOcr(pages[i], {
					onProgress: (stage) => {
						ocrStage = stage;
					}
				});
				pageTexts.push(unicodeBraille);
			}
			await sync.loadText(braille2Ascii(pageTexts.join('\n\n')));
			filename = pages[0].name.split('.').slice(0, -1).join('.') + '.tex';
		} catch (err) {
			ocrError = err?.message ?? 'OCR failed.';
		} finally {
			ocrLoading = false;
			ocrStage = '';
			ocrPageProgress = '';
		}
	}
</script>

<!-- Styling is done with https://tailwindcss.com/, add a css class with whatever style you want -->
<div class="flex flex-row justify-center dark:bg-gray-900">
	<div class="h-screen flex-initial w-300 m-5">
		<div
			class="p-3 border border-gray-100 rounded-lg shadow-lg dark:border-gray-700 dark:bg-gray-800"
		>
			<div class="pb-4 px-4">
				<h3 class="text-3xl dark:text-gray-100">File Upload</h3>

				<label
					id="braille-file-label"
					for="braille-file"
					class="block mb-2 text-sm font-medium text-gray-900 dark:text-white">Upload file</label
				>
				<input
					accept={[...authorizedExtensions, 'image/*'].join(',')}
					onchange={handleUpload}
					disabled={!sync.state.ready || ocrLoading}
					id="braille-file"
					name="braille-file"
					type="file"
					multiple
					aria-labelledby="braille-file-label"
					aria-busy={ocrLoading}
					class="block w-96 text-sm bg-gray-50 dark:bg-gray-950 dark:text-gray-100 file:cursor-pointer cursor-pointer rounded-lg border border-gray-300 dark:border-gray-700 file:py-2 file:px-4 file:mr-4 file:bg-gray-800 dark:file:bg-gray-600 file:hover:bg-gray-700 file:text-white font-light file:font-normal disabled:opacity-50"
				/>
				<p class="mt-1 text-sm text-gray-500 dark:text-gray-300" id="file_input_help">
					A BRF or BRL file, or one or more photos of a physical braille page (select multiple for a
					document spanning several pages) — detected cells are converted to braille text
					automatically. See BRF/BRL syntax requirements <a
						href="https://github.com/make4all/braille2latex"
						class="font-medium text-blue-600 underline dark:text-blue-500 hover:no-underline"
						>here</a
					>
				</p>
				{#if ocrLoading}
					<p class="mt-1 text-sm text-gray-500 dark:text-gray-300" role="status" aria-live="polite">
						{ocrPageProgress}{ocrStageLabels[ocrStage] ?? 'Running OCR…'}
					</p>
				{/if}
				{#if ocrError}
					<p class="mt-1 text-sm text-red-500" role="alert">
						{ocrError}
					</p>
				{/if}
			</div>
			<div class="pb-4 px-4">
				<label
					for="braille-table"
					class="block mb-2 text-sm font-medium text-gray-900 dark:text-white">Braille table</label
				>
				<select
					id="braille-table"
					bind:value={selectedTable}
					onchange={handleTableChange}
					class="block w-96 text-sm bg-gray-50 dark:bg-gray-950 dark:text-gray-100 rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2"
				>
					{#each brailleTables as table (table.value)}
						<option value={table.value}>{table.label}</option>
					{/each}
				</select>
				<p class="mt-1 text-sm text-gray-500 dark:text-gray-300">
					Used for translation between braille and LaTeX.
				</p>
			</div>

			{#if !sync.state.ready}
				<p class="px-4 text-gray-500 dark:text-gray-300" role="status" aria-live="polite">
					Initializing…
				</p>
			{/if}
			{#if sync.state.loadError}
				<p class="px-4 text-sm text-red-500" role="alert">
					Couldn't load the document: {sync.state.loadError}
				</p>
			{/if}

			<div class="flex flex-col lg:flex-row">
				<div class="p-4 flex-1 min-w-0">
					<h3 class="text-3xl dark:text-gray-100 mb-2">Braille (NABCC)</h3>
					<details class="mb-2 text-sm text-gray-500 dark:text-gray-300">
						<summary class="cursor-pointer font-medium text-gray-900 dark:text-white">
							Using NVDA with a braille display?
						</summary>
						<div class="mt-1 space-y-1">
							<p>
								This field uses NABCC ("English North American Braille Computer Code") — plain ASCII
								text, one letter/symbol per braille cell. NABCC is the same encoding BRF files use,
								and NVDA ships a working input/output table for it.
							</p>
							<p>To read and type braille correctly here with NVDA and a braille display:</p>
							<ol class="list-decimal list-inside">
								<li>Open the NVDA menu → Preferences → Settings → Braille.</li>
								<li>
									Set <strong>Input table</strong> to "English North American Braille Computer Code (NABCC)
									(en-nabcc.utb)".
								</li>
								<li>Set <strong>Output table</strong> to the same table.</li>
							</ol>
						</div>
					</details>
					<textarea
						id="braille-text"
						bind:this={brailleEl}
						disabled={!sync.state.ready}
						oninput={sync.handleBrailleInput}
						onblur={sync.handleBrailleBlur}
						class="font-mono bg-gray-900 text-gray-100 rounded-lg p-2.5 whitespace-pre w-full h-96 resize-none overflow-y-auto disabled:opacity-50"
						placeholder="Enter NABCC braille text here or upload a file..."
						aria-label="Braille (NABCC) input, editable"
					></textarea>
				</div>
				<div class="p-4 flex-1 min-w-0">
					<h3 class="text-3xl dark:text-gray-100 mb-2">LaTeX</h3>
					<textarea
						id="latex-output"
						data-testid="latex-output"
						bind:this={latexEl}
						disabled={!sync.state.ready}
						oninput={sync.handleLatexInput}
						onblur={sync.handleLatexBlur}
						class="font-mono bg-gray-900 text-gray-100 rounded-lg p-2.5 whitespace-pre w-full h-96 resize-none overflow-y-auto disabled:opacity-50"
						placeholder="LaTeX will appear here once the braille pane has content..."
						aria-label="LaTeX input, editable"
					></textarea>
				</div>
			</div>

			<div class="px-4">
				<p class="sr-only" role="status" aria-live="polite">
					{#if sync.state.issues.length > 0}
						{sync.state.issues.length} sync {sync.state.issues.length === 1 ? 'issue' : 'issues'} — see
						the sync issues list below.
					{:else}
						No sync issues.
					{/if}
				</p>
				<SyncIssues
					issues={sync.state.issues}
					onGoTo={(issue) => sync.focusNode(issue.pane, issue.range)}
				/>
			</div>

			<div class="p-4">
				<h3 class="text-3xl dark:text-gray-100">File Download</h3>
				<p class="mt-1 mb-3 text-sm text-gray-500 dark:text-gray-300">
					Download the converted LaTeX or compile it to PDF.
				</p>
				<div class="flex flex-wrap gap-2">
					<div>
						<label id="latex-download-label" for="latex-download" class="sr-only"
							>Download a LaTeX file</label
						>
						<button
							id="latex-download"
							name="latex-download"
							class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 dark:bg-blue-800 dark:hover:bg-blue-900"
							onclick={() => {
								const complete = wrapLatexDocument(sync.getDoc()?.latexText ?? '');
								if (!isCompleteLatexDocument(complete)) {
									console.warn('[download] Wrapped LaTeX document may be incomplete');
								}
								downloadText(complete, filename);
							}}
						>
							Download LaTeX (.tex)
						</button>
					</div>

					<div>
						<label id="html-download-label" for="html-download" class="sr-only"
							>Convert to HTML</label
						>
						<button
							id="html-download"
							name="html-download"
							disabled={htmlLoading}
							aria-busy={htmlLoading}
							class="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 dark:bg-purple-800 dark:hover:bg-purple-900 disabled:opacity-50 disabled:cursor-not-allowed"
							onclick={async () => {
								htmlError = '';
								htmlLoading = true;
								try {
									const complete = wrapLatexDocument(sync.getDoc()?.latexText ?? '');
									await compileToHTML(complete);
								} catch (err) {
									htmlError = err?.message ?? 'HTML conversion failed.';
								} finally {
									htmlLoading = false;
								}
							}}
						>
							{htmlLoading ? 'Converting…' : 'Open HTML'}
						</button>
					</div>
				</div>

				{#if htmlError}
					<p class="mt-2 text-sm text-red-500" role="alert">
						{htmlError}
					</p>
				{/if}
			</div>
			<footer class="mt-4 px-4 text-sm text-gray-500 dark:text-gray-300">
				<a
					href="https://github.com/brailletools/webeditor/issues"
					class="font-medium text-blue-600 underline dark:text-blue-500 hover:no-underline"
					>Submit a bug</a
				>
				<span aria-hidden="true"> · </span>
				<a
					href="https://github.com/brailletools"
					class="font-medium text-blue-600 underline dark:text-blue-500 hover:no-underline"
					>View on GitHub</a
				>
			</footer>
		</div>
	</div>
</div>
