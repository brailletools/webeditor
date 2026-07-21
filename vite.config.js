import tailwindcss from '@tailwindcss/vite';
import devtoolsJson from 'vite-plugin-devtools-json';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit(), devtoolsJson()],
	// pandoc-wasm's browser entry does a bare `import('./pandoc.wasm')` — per
	// its own README's Vite guidance, this makes Vite treat *.wasm as a static
	// asset (returning a URL on import) instead of trying to parse it as JS.
	assetsInclude: ['**/*.wasm'],
	// Exclude latex.js and html2pdf from pre-optimization due to dynamic requires
	// They will be loaded dynamically at runtime instead. onnxruntime-web is
	// excluded too: pre-bundling rewrites its internal `new URL(..., import.meta.url)`
	// wasm reference to point inside .vite/deps/, where the wasm file was never
	// copied (dev-server-only 404, not reproduced by `vite build`). pandoc-wasm
	// is excluded for the same class of reason: its browser entry does its own
	// `await import('./pandoc.wasm')` internally (see braille-bridge's src/pandoc.js's doc
	// comment) and is only ever imported dynamically at runtime, on first
	// actual use — never eagerly, given its ~56MB wasm binary.
	optimizeDeps: {
		exclude: ['latex.js', 'html2pdf.js', 'onnxruntime-web', 'pandoc-wasm']
	},
	// pandoc-wasm's browser entry (src/index.browser.js) uses top-level await
	// to fetch/instantiate its wasm binary — Vite/esbuild's default production
	// target (~ES2020: chrome87/edge88/firefox78/safari14) predates top-level
	// await support and fails the build outright. This app already assumes a
	// modern browser for its other WASM/Worker-heavy features (liblouis,
	// onnxruntime-web), so raising the target is a fit, not a compromise.
	build: {
		target: 'es2022'
	}
});
