import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('$app/paths', () => ({ base: '/' }));

// jsdom has no real Worker; ocrClient.js only needs addEventListener/removeEventListener/
// postMessage plus the ability for this test to simulate the worker posting back
// 'progress'/'result'/'error' messages -- EventTarget covers all of that.
class FakeWorker extends EventTarget {
	constructor() {
		super();
		this.postMessage = vi.fn();
	}
}

/** @type {FakeWorker[]} */
let createdWorkers;

beforeEach(() => {
	// ocrClient.js's `worker`/`inFlight` module state must not leak between
	// tests -- each test needs a fresh module instance, same as each real page
	// load gets a fresh one.
	vi.resetModules();
	createdWorkers = [];
	vi.stubGlobal(
		'Worker',
		class extends FakeWorker {
			constructor() {
				super();
				createdWorkers.push(this);
			}
		}
	);
});

describe('runOcr overlapping-call guard', () => {
	test('a second call while one is in flight rejects immediately instead of sharing the worker', async () => {
		const { runOcr } = await import('./ocrClient.js');

		const first = runOcr(new File(['x'], 'a.png'));
		await expect(runOcr(new File(['x'], 'b.png'))).rejects.toThrow(/already running/i);

		// The in-flight guard must not have consumed the second call's listeners on
		// the shared worker -- only one worker should exist, with only the first
		// call's machinery still attached.
		expect(createdWorkers.length).toBe(1);

		createdWorkers[0].dispatchEvent(
			new MessageEvent('message', { data: { type: 'result', unicodeBraille: 'ABC', rotation: 0 } })
		);
		await expect(first).resolves.toEqual({ unicodeBraille: 'ABC', rotation: 0 });
	});

	test('a call is allowed again once the previous one resolves', async () => {
		const { runOcr } = await import('./ocrClient.js');

		const first = runOcr(new File(['x'], 'a.png'));
		createdWorkers[0].dispatchEvent(
			new MessageEvent('message', { data: { type: 'result', unicodeBraille: 'ABC', rotation: 0 } })
		);
		await first;

		const second = runOcr(new File(['x'], 'b.png'));
		createdWorkers[0].dispatchEvent(
			new MessageEvent('message', {
				data: { type: 'result', unicodeBraille: 'DEF', rotation: 180 }
			})
		);
		await expect(second).resolves.toEqual({ unicodeBraille: 'DEF', rotation: 180 });
	});

	test('a call is allowed again once the previous one rejects (in-flight flag is cleared on error too)', async () => {
		const { runOcr } = await import('./ocrClient.js');

		const first = runOcr(new File(['x'], 'a.png'));
		createdWorkers[0].dispatchEvent(
			new MessageEvent('message', { data: { type: 'error', message: 'boom' } })
		);
		await expect(first).rejects.toThrow('boom');

		const second = runOcr(new File(['x'], 'b.png'));
		createdWorkers[0].dispatchEvent(
			new MessageEvent('message', {
				data: { type: 'result', unicodeBraille: 'DEF', rotation: 180 }
			})
		);
		await expect(second).resolves.toEqual({ unicodeBraille: 'DEF', rotation: 180 });
	});
});

describe('runOcr rotation', () => {
	test('asks for automatic orientation unless told otherwise', async () => {
		const { runOcr } = await import('./ocrClient.js');

		runOcr(new File(['x'], 'a.png'));
		expect(createdWorkers[0].postMessage.mock.calls[0][0].rotation).toBe('auto');
		createdWorkers[0].dispatchEvent(
			new MessageEvent('message', { data: { type: 'result', unicodeBraille: '', rotation: 0 } })
		);

		runOcr(new File(['x'], 'a.png'), { rotation: 270 });
		expect(createdWorkers[0].postMessage.mock.calls[1][0].rotation).toBe(270);
	});
});
