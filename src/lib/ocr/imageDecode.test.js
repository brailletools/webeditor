import { describe, test, expect } from 'vitest';
import { isHeic } from './imageDecode.js';

describe('isHeic', () => {
	test('recognises HEIC/HEIF by MIME type or by file name', () => {
		expect(isHeic(new File(['x'], 'a.bin', { type: 'image/heic' }))).toBe(true);
		expect(isHeic(new File(['x'], 'IMG_3817.HEIC'))).toBe(true);
		expect(isHeic(new File(['x'], 'photo.heif'))).toBe(true);
	});

	test('does not flag other photos', () => {
		expect(isHeic(new File(['x'], 'a.jpeg', { type: 'image/jpeg' }))).toBe(false);
		expect(isHeic(new Blob(['x'], { type: 'image/png' }))).toBe(false);
		expect(isHeic(new File(['x'], 'heic-notes.txt'))).toBe(false);
	});
});
