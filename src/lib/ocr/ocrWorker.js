// Dedicated Worker running the whole OCR pipeline off the main thread: decode
// -> tiled/scale-normalized detection -> classification -> line/space layout
// -> Unicode braille text. A single request/response per upload (unlike
// liblouis's long-lived easy-api.js worker, which needs its own callId
// dispatch because liblouis's WASM API is synchronous-call-shaped) -- both
// onnxruntime-web and @brailletools/brailleocr-web are already
// Promise-based, so plain postMessage/onmessage is enough.
import * as ort from 'onnxruntime-web';
import {
	CellDetector,
	CellClassifier,
	detectScaleNormalized,
	layoutCellsIntoLines,
	layoutToUnicodeBraille
} from '@brailletools/brailleocr-web';
import { decodeImageToRgbHwc } from './imageDecode.js';

// Loaded once, reused across every 'run' message this worker instance
// receives -- model loading has real cost, no reason to pay it per upload.
/** @type {Promise<InstanceType<typeof CellDetector>> | null} */
let detectorPromise = null;
/** @type {Promise<InstanceType<typeof CellClassifier>> | null} */
let classifierPromise = null;
let wasmConfigured = false;

function configureWasm() {
	if (wasmConfigured) return;
	// ort.env is a singleton per resolved module -- this is the same 'ort'
	// instance CellDetector/CellClassifier import internally, so configuring
	// it here (before their first .load() call below) takes effect for them.
	// Deliberately NOT setting ort.env.wasm.wasmPaths: onnxruntime-web's own
	// bundle already resolves its wasm file via `new URL(..., import.meta.url)`,
	// which Vite statically discovers and bundles as a hashed worker asset
	// automatically (confirmed in the built output). Setting wasmPaths would
	// override that with a manually-hosted copy instead -- redundant (Vite
	// would still bundle its own copy too, unused) rather than helpful.
	// Reinforces what the bundle already auto-detects from
	// `!self.crossOriginIsolated` (GitHub Pages can't set the COOP/COEP
	// headers SharedArrayBuffer needs).
	ort.env.wasm.numThreads = 1;
	wasmConfigured = true;
}

self.onmessage = async (event) => {
	const { type, file, detectorUrl, classifierUrl, confThreshold } = event.data;
	if (type !== 'run') return;

	try {
		configureWasm();

		self.postMessage({ type: 'progress', stage: 'decoding' });
		const { rgb, width, height } = await decodeImageToRgbHwc(file);

		self.postMessage({ type: 'progress', stage: 'detecting' });
		detectorPromise ??= CellDetector.load(detectorUrl);
		const detector = await detectorPromise;
		const boxes = await detectScaleNormalized(detector, rgb, width, height, { confThreshold });

		self.postMessage({ type: 'progress', stage: 'classifying' });
		classifierPromise ??= CellClassifier.load(classifierUrl);
		const classifier = await classifierPromise;
		const bits = await classifier.classify(rgb, width, height, boxes);

		/** @type {Array<{cx: number, cy: number, w: number, h: number, bits: string}>} */
		const cells = boxes.map((b, i) => ({ ...b, bits: bits[i] }));
		const lines = layoutCellsIntoLines(cells);
		const unicodeBraille = layoutToUnicodeBraille(lines);

		self.postMessage({ type: 'result', unicodeBraille });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		self.postMessage({ type: 'error', message });
	}
};
