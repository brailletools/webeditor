import tailwindcss from '@tailwindcss/vite';
import devtoolsJson from 'vite-plugin-devtools-json';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit(), devtoolsJson()],
	// Exclude latex.js and html2pdf from pre-optimization due to dynamic requires
	// They will be loaded dynamically at runtime instead. onnxruntime-web is
	// excluded too: pre-bundling rewrites its internal `new URL(..., import.meta.url)`
	// wasm reference to point inside .vite/deps/, where the wasm file was never
	// copied (dev-server-only 404, not reproduced by `vite build`).
	optimizeDeps: {
		exclude: ['latex.js', 'html2pdf.js', 'onnxruntime-web']
	}
});
