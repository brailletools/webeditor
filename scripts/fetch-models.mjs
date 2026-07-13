#!/usr/bin/env node
// Fetches the OCR ONNX models (cell_detector.onnx, cell_classifier.onnx)
// into static/models/, from the pinned dataset.version tag — not a full
// clone, since dataset's .git history is large (~470MB) and its tagged tree
// (~1.4GB) carries sample images/weights this app doesn't need, just the two
// small (~20MB combined) .onnx files. Same build-time-fetch-then-self-host
// pattern as liblouis-fetch-web (see package.json dev/build scripts), so the
// deployed site stays fully self-contained and doesn't depend on GitHub
// being reachable at runtime for end users.
import { mkdirSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const outDir = join(repoRoot, 'static', 'models');
const files = ['cell_detector.onnx', 'cell_classifier.onnx'];

mkdirSync(outDir, { recursive: true });

const version = readFileSync(join(repoRoot, 'dataset.version'), 'utf-8').trim();
console.log(`Fetching models from brailletools/dataset@${version}`);
for (const f of files) {
	const url = `https://raw.githubusercontent.com/brailletools/dataset/${version}/models/${f}`;
	const res = await fetch(url);
	if (!res.ok) {
		throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
	}
	const buf = Buffer.from(await res.arrayBuffer());
	const dest = join(outDir, f);
	await writeFile(dest, buf);
	console.log(`  wrote ${dest} (${buf.length} bytes)`);
}
