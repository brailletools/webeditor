// Main-thread wrapper around ocrWorker.js: spawns the worker lazily (don't
// pay model-load cost before the feature is used), resolves the absolute
// model URLs here rather than in the worker -- relative URLs inside a Worker
// resolve against the WORKER's own script location, not the page, so
// $app/paths's `base` must be turned into an absolute URL on this side.
// (onnxruntime-web's own wasm asset doesn't need this treatment -- Vite
// discovers and bundles it automatically, see ocrWorker.js.)
import { base } from '$app/paths';

const basePath = (base === '/' ? '' : base).replace(/^\//, '');

/** @param {string} relativeDir */
function absoluteUrl(relativeDir) {
	const path = basePath ? `${basePath}/${relativeDir}/` : `${relativeDir}/`;
	return new URL(path, window.location.href).href;
}

/** @type {Worker | null} */
let worker = null;

function getWorker() {
	if (!worker) {
		worker = new Worker(new URL('./ocrWorker.js', import.meta.url), { type: 'module' });
	}
	return worker;
}

/**
 * Runs the full OCR pipeline on an uploaded image file and resolves to
 * Unicode braille text (one line per detected text line, spaces inferred).
 * @param {File} file
 * @param {{confThreshold?: number, onProgress?: (stage: string) => void}} [opts]
 * @returns {Promise<string>}
 */
export function runOcr(file, { confThreshold = 0.15, onProgress } = {}) {
	const w = getWorker();
	const modelsBase = absoluteUrl('models');

	return new Promise((resolve, reject) => {
		function cleanup() {
			w.removeEventListener('message', handleMessage);
			w.removeEventListener('error', handleError);
		}
		/** @param {MessageEvent} event */
		function handleMessage(event) {
			const { type } = event.data;
			if (type === 'progress') {
				onProgress?.(event.data.stage);
			} else if (type === 'result') {
				cleanup();
				resolve(event.data.unicodeBraille);
			} else if (type === 'error') {
				cleanup();
				reject(new Error(event.data.message));
			}
		}
		/** @param {ErrorEvent} event */
		function handleError(event) {
			cleanup();
			reject(new Error(event.message ?? 'OCR worker error'));
		}

		w.addEventListener('message', handleMessage);
		w.addEventListener('error', handleError);
		w.postMessage({
			type: 'run',
			file,
			detectorUrl: `${modelsBase}cell_detector.onnx`,
			classifierUrl: `${modelsBase}cell_classifier.onnx`,
			confThreshold
		});
	});
}
