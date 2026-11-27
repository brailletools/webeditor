<script>
	// Read-only rendered view of the document. Math is MathML, which screen readers read
	// natively. Deliberately not a live region: it re-renders as the user types, and
	// announcing the whole document each time would drown out their typing.
	import { latexToHtml, wrapLatexDocument } from '$lib/helper.js';

	let { latex = '', element = $bindable(), onkeydown } = $props();

	let result = $derived.by(() => {
		if (!latex.trim()) return { html: '', error: '' };
		try {
			return { html: latexToHtml(wrapLatexDocument(latex)), error: '' };
		} catch (error) {
			return { html: '', error: error instanceof Error ? error.message : String(error) };
		}
	});
</script>

{#if result.error}
	<p class="mb-2 text-sm text-red-500" role="alert">Couldn't show the HTML view: {result.error}</p>
{/if}
<!-- Focusable so keyboard users can scroll it and jump to and from the braille pane. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<section
	bind:this={element}
	{onkeydown}
	tabindex="0"
	data-testid="html-preview"
	aria-label="HTML preview, read only. Press Control+Alt+J to jump to the braille pane."
	class="html-preview bg-white text-black rounded-lg border border-gray-300 p-4 w-full h-96 overflow-auto"
>
	<!-- latexToHtml() strips scripts, event handlers and unsafe URLs. -->
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html result.html}
</section>
