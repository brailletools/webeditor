import tailwindcss from '@tailwindcss/vite';
import devtoolsJson from 'vite-plugin-devtools-json';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit(), devtoolsJson()],
	// Exclude latex.js and html2pdf from pre-optimization due to dynamic requires
	// They will be loaded dynamically at runtime instead
	optimizeDeps: {
		// Exclude packages that rely on globalThis side-effects or dynamic requires
		// that esbuild pre-bundling breaks at runtime.
		exclude: ['latex.js', 'html2pdf.js', '@brailletools/braille2latex']
	}
});
