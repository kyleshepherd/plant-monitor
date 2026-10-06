import { describe, it, expect } from 'vitest';
import { shouldRestart } from '../src/lib/server/watchdog';

const now = new Date('2026-10-06T12:00:00Z').getTime();
const h = (n: number) => now - n * 3600_000;

describe('shouldRestart', () => {
	it('leaves a gateway that is still forwarding alone', () => {
		expect(shouldRestart(h(1), null, now)).toBe(false);
	});
	it('restarts after 2h of silence', () => {
		expect(shouldRestart(h(2), null, now)).toBe(true);
	});
	it('waits 6h before retrying a restart that did not help', () => {
		expect(shouldRestart(h(5), h(3), now)).toBe(false);
		expect(shouldRestart(h(8), h(6), now)).toBe(true);
	});
	it('a fresh broadcast after a restart resets the clock', () => {
		expect(shouldRestart(h(0.5), h(7), now)).toBe(false);
	});
});
