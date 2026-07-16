// Decodes an uploaded image File/Blob into the HWC RGB Float32Array shape
// @brailletools/brailleocr-web's CellDetector/CellClassifier expect. Runs
// inside the OCR worker (see ocrWorker.js), where OffscreenCanvas is
// available — no DOM dependency, matching brailleocr-web's own imageOps.js.

/**
 * @param {File|Blob} fileOrBlob
 * @returns {Promise<{rgb: Float32Array, width: number, height: number}>}
 */
export async function decodeImageToRgbHwc(fileOrBlob) {
	// 'from-image' is already the spec default in current browsers, but pass
	// it explicitly rather than rely on that — the default has changed before
	// and the detector/classifier were tuned against EXIF-respecting decoding
	// (see brailleocr's own test harness, which uses sharp's equivalent
	// `.rotate()` with no args for the same reason).
	const bitmap = await createImageBitmap(fileOrBlob, { imageOrientation: 'from-image' });

	const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Could not get a 2D context from OffscreenCanvas');
	ctx.drawImage(bitmap, 0, 0);
	bitmap.close();

	const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);

	// data is RGBA (Uint8ClampedArray); strip the alpha channel into HWC RGB.
	const rgb = new Float32Array(width * height * 3);
	for (let i = 0; i < width * height; i++) {
		rgb[i * 3] = data[i * 4];
		rgb[i * 3 + 1] = data[i * 4 + 1];
		rgb[i * 3 + 2] = data[i * 4 + 2];
	}

	return { rgb, width, height };
}
