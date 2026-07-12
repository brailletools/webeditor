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
	import {
		parse,
		configure,
		whenReady,
		ascii2Braille,
		braille2Ascii
	} from '@brailletools/braille2latex';

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
	const tables_url = manifest.tablesDir ? `${liblouisBase}/${manifest.tablesDir}` : null;

	// Give the braille2latex package its liblouis URLs
	globalThis.__bt_debug = { base, basePath, capi_url, easyapi_url, tables_url, manifest };
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

	let text = $state(sample);
	let filename = $state('example_filename.tex');
	let selectedTable = $state(brailleTables[0].value);

	// Keep braille text as state, but sync with text
	let brailleText = $state(ascii2Braille(sample));

	// Track if the Worker is ready
	let parseReady = $state(false);

	// Check if a string contains braille characters (Unicode 0x2800-0x28FF range)
	function containsBraille(str) {
		return /[\u2800-\u28FF]/.test(str);
	}

	// Check if a string contains ASCII text (not just braille or whitespace)
	function containsAscii(str) {
		return /[^\u2800-\u28FF\s\n]/.test(str);
	}

	// Convert any remaining ASCII letters to braille in a mixed string
	function sanitizeToAllBraille(str) {
		let result = '';
		for (const char of str) {
			if (/[a-z]/i.test(char)) {
				// It's a letter - convert to braille
				result += ascii2Braille(char);
			} else {
				// Keep as-is (braille, space, newline, etc.)
				result += char;
			}
		}
		return result;
	}

	// Intercept and convert ASCII letters before they enter the textarea
	function handleBeforeInput(event) {
		if (event.data && /[a-z]/i.test(event.data)) {
			// It's a letter - convert it to braille
			const brailleChar = ascii2Braille(event.data);
			console.log('Converting letter before input:', event.data, '=>', brailleChar);
			event.preventDefault();

			// Insert the braille character at the cursor position
			const textarea = event.target;
			const start = textarea.selectionStart;
			const end = textarea.selectionEnd;
			const currentValue = textarea.value;

			const newValue = currentValue.substring(0, start) + brailleChar + currentValue.substring(end);
			textarea.value = newValue;
			brailleText = newValue;
			text = braille2Ascii(newValue);

			// Move cursor to after inserted character
			textarea.setSelectionRange(start + brailleChar.length, start + brailleChar.length);
		}
	}

	// Update both text representations when user types or pastes
	function handleBrailleInput(event) {
		let inputValue = event.target.value;

		// Sanitize any stray ASCII letters to braille (for paste events)
		inputValue = sanitizeToAllBraille(inputValue);

		// Determine if input contains ASCII or braille
		const hasAscii = containsAscii(inputValue);
		const hasBraille = containsBraille(inputValue);

		console.log('Input detected - ASCII:', hasAscii, 'Braille:', hasBraille);

		if (hasAscii && !hasBraille) {
			// Pure ASCII input - convert to braille for display, keep ASCII for processing
			const brailleConverted = ascii2Braille(inputValue);
			console.log('ASCII to Braille:', inputValue, '=>', brailleConverted);
			brailleText = brailleConverted;
			text = inputValue;
		} else if (hasBraille) {
			// Braille input - convert to ASCII for processing
			const asciiConverted = braille2Ascii(inputValue);
			console.log('Braille to ASCII:', inputValue, '=>', asciiConverted);
			brailleText = inputValue;
			text = asciiConverted;
		} else {
			// Only whitespace or empty
			brailleText = inputValue;
			text = inputValue;
		}
	}

	let latex = $derived.by(async () => {
		// Wait for Worker to be ready before attempting to parse
		if (!parseReady) {
			console.log('[latex] Waiting for parser to be ready...');
			return 'Initializing...';
		}

		try {
			console.log('[latex] Parsing with table:', selectedTable);
			console.log('[latex] Input text length:', text.length);

			// Parse the braille input with the selected table
			let evalstring = await parse(text, selectedTable);
			console.log('[latex] Parse complete');
			resolvedLatex = evalstring;
			return evalstring;
		} catch (error) {
			console.error('Parse error:', error);
			const errorMsg = `Error: ${error.message}`;
			resolvedLatex = errorMsg;
			return errorMsg;
		}
	});

	// Track the resolved LaTeX for download
	let resolvedLatex = $state('');

	// HTML conversion state
	let htmlLoading = $state(false);
	let htmlError = $state('');

	const authorizedExtensions = ['.brf', '.brl'];

	// configure() (above) already constructs and initializes the liblouis Worker;
	// whenReady() resolves once that's done, so the UI can gate on it.
	whenReady()
		.then(() => {
			parseReady = true;
			console.log('[liblouis] Worker initialized and ready');
		})
		.catch((error) => {
			console.error('[liblouis] Initialization failed', error);
		});
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
					accept={authorizedExtensions.join(',')}
					onchange={(event) => {
						handleFileChange(event, (result, fname) => {
							text = result;
							brailleText = ascii2Braille(result);
							filename = fname.split('.').slice(0, -1).join('.') + '.tex';
						});
					}}
					id="braille-file"
					name="braille-file"
					type="file"
					aria-labelledby="braille-file-label"
					class="block w-96 text-sm bg-gray-50 dark:bg-gray-950 dark:text-gray-100 file:cursor-pointer cursor-pointer rounded-lg border border-gray-300 dark:border-gray-700 file:py-2 file:px-4 file:mr-4 file:bg-gray-800 dark:file:bg-gray-600 file:hover:bg-gray-700 file:text-white font-light file:font-normal"
				/>
				<p class="mt-1 text-sm text-gray-500 dark:text-gray-300" id="file_input_help">
					BRF or BRL. See syntax requirements <a
						href="https://github.com/make4all/braille2latex"
						class="font-medium text-blue-600 underline dark:text-blue-500 hover:no-underline"
						>here</a
					>
				</p>
			</div>
			<div class="pb-4 px-4">
				<label
					for="braille-table"
					class="block mb-2 text-sm font-medium text-gray-900 dark:text-white">Braille table</label
				>
				<select
					id="braille-table"
					bind:value={selectedTable}
					class="block w-96 text-sm bg-gray-50 dark:bg-gray-950 dark:text-gray-100 rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2"
				>
					{#each brailleTables as table (table.value)}
						<option value={table.value}>{table.label}</option>
					{/each}
				</select>
				<p class="mt-1 text-sm text-gray-500 dark:text-gray-300">
					Used for back-translation during LaTeX conversion.
				</p>
			</div>
			<div class="flex flex-col lg:flex-row">
				<div class="p-4 flex-auto">
					<h3 class="text-3xl dark:text-gray-100 mb-2">Input (Braille)</h3>
					<textarea
						id="braille-text"
						value={brailleText}
						onbeforeinput={handleBeforeInput}
						oninput={handleBrailleInput}
						class="font-mono bg-gray-900 text-gray-100 rounded-lg p-2.5 whitespace-pre w-full h-96 resize-none overflow-y-auto"
						placeholder="Enter braille text here or upload a file..."
						aria-label="Braille input text"
					></textarea>
				</div>
				<div class="p-4 flex-auto">
					<h3 class="text-3xl dark:text-gray-100 mb-2">Output</h3>
					<div
						class="font-mono bg-gray-900 text-gray-100 rounded-lg p-2.5 whitespace-pre-line max-h-96 overflow-y-auto"
					>
						{#await latex}
							<span class="text-gray-500">Processing... (check browser console for errors)</span>
						{:then result}
							{#if result?.startsWith('Error')}
								<span class="text-red-500">{result}</span>
							{:else}
								{result}
							{/if}
						{:catch error}
							<span class="text-red-500">Fatal Error: {error?.message || error}</span>
						{/await}
					</div>
				</div>
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
								const complete = wrapLatexDocument(resolvedLatex);
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
									const complete = wrapLatexDocument(resolvedLatex);
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
		</div>
	</div>
</div>
