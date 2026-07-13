<script>
	import '../app.css';

	let { children } = $props();
</script>

<svelte:boundary>
	{#snippet pending()}
		<p role="status" aria-live="polite">Loading…</p>
	{/snippet}

	{@render children()}
</svelte:boundary>
