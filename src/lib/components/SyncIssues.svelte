<script>
	// Persistent list of paragraphs/equations currently out of sync between the
	// braille and LaTeX panes. Always rendered (not display:none when empty) so it
	// doesn't have to be independently discovered — see the side-by-side sync plan's
	// error-handling section. Reflects current issues only; an entry disappears the
	// instant that node resyncs, no resolved-issues history is kept.
	let { issues = [], onGoTo } = $props();
</script>

<section
	aria-label="Sync issues"
	class="mt-4 p-3 border border-gray-200 rounded-lg dark:border-gray-700 dark:bg-gray-800"
>
	<h3 class="text-lg font-medium dark:text-gray-100 mb-2">Sync issues</h3>
	{#if issues.length === 0}
		<p class="text-sm text-gray-500 dark:text-gray-300">
			No sync issues — braille and LaTeX are in sync.
		</p>
	{:else}
		<ul class="space-y-1">
			{#each issues as issue (issue.pane + ':' + issue.nodeId)}
				<li>
					<button
						type="button"
						class="text-sm text-left w-full px-2 py-1 rounded border border-red-300 bg-red-50 text-red-800 hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:text-red-200 dark:hover:bg-red-900"
						onclick={() => onGoTo?.(issue)}
					>
						<span class="font-medium">{issue.label}</span>
						({issue.pane === 'latex' ? 'LaTeX' : 'Braille'} pane): {issue.message}
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</section>
