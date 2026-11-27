<script>
	// Settings popup. A native <dialog> opened with showModal() gives the accessible
	// behaviour for free: focus moves in and is contained, Escape closes it, the rest of
	// the page is inert, and focus returns to the Settings button afterwards.
	let {
		tables,
		selectedTable = $bindable(),
		onTableChange,
		disabled = false,
		loadError = ''
	} = $props();

	/** @type {HTMLDialogElement | undefined} */
	let dialog = $state();
</script>

<button
	type="button"
	id="settings-button"
	aria-haspopup="dialog"
	onclick={() => dialog?.showModal()}
	class="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 bg-gray-50 text-gray-900 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:hover:bg-gray-800"
>
	Settings
</button>

<dialog
	bind:this={dialog}
	id="settings-dialog"
	aria-labelledby="settings-title"
	class="m-auto w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-lg border border-gray-300 bg-white p-6 text-gray-900 shadow-xl backdrop:bg-black/60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
>
	<h2 id="settings-title" class="text-2xl mb-4">Settings</h2>

	<label for="braille-table" class="block mb-2 text-sm font-medium">Braille table</label>
	<select
		id="braille-table"
		bind:value={selectedTable}
		onchange={onTableChange}
		{disabled}
		aria-describedby="braille-table-help"
		class="block w-full text-sm bg-gray-50 dark:bg-gray-950 rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 disabled:opacity-50"
	>
		{#each tables as table (table.value)}
			<option value={table.value}>{table.label}</option>
		{/each}
	</select>
	<p id="braille-table-help" class="mt-1 text-sm text-gray-500 dark:text-gray-300">
		Used for translation between braille and LaTeX.
	</p>
	{#if loadError}
		<p class="mt-1 text-sm text-red-500" role="alert">
			Couldn't load the document: {loadError}
		</p>
	{/if}

	<h3 class="text-lg font-medium mt-6 mb-2">Using NVDA with a braille display?</h3>
	<div class="space-y-2 text-sm text-gray-600 dark:text-gray-300">
		<p>
			The braille field uses NABCC ("English North American Braille Computer Code") — plain ASCII
			text, one letter/symbol per braille cell. NABCC is the same encoding BRF files use, and NVDA
			ships a working input/output table for it.
		</p>
		<p>To read and type braille correctly there with NVDA and a braille display:</p>
		<ol class="list-decimal list-inside">
			<li>Open the NVDA menu → Preferences → Settings → Braille.</li>
			<li>
				Set <strong>Input table</strong> to "English North American Braille Computer Code (NABCC) (en-nabcc.utb)".
			</li>
			<li>Set <strong>Output table</strong> to the same table.</li>
		</ol>
	</div>

	<form method="dialog" class="mt-6 flex justify-end">
		<button
			class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 dark:bg-blue-800 dark:hover:bg-blue-900"
		>
			Close
		</button>
	</form>
</dialog>
