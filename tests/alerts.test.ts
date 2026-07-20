import { describe, it, expect } from 'vitest';
import { evaluateSensor, alertDecision } from '../src/lib/server/alerts';

const now = new Date('2026-07-20T12:00:00Z');
const h = (n: number) => new Date(now.getTime() - n * 3600_000);

describe('evaluateSensor', () => {
	const base = { moistureMin: 25, battery: 80 as number | null, lastSeenAt: h(1), now };
	it('flags low moisture', () => {
		expect(evaluateSensor({ ...base, latest: { moisture: 12, recordedAt: h(1) } })).toContain(
			'low_moisture'
		);
	});
	it('no alert at/above threshold', () => {
		expect(evaluateSensor({ ...base, latest: { moisture: 25, recordedAt: h(1) } })).toEqual([]);
	});
	it('flags low battery under 15%', () => {
		expect(
			evaluateSensor({ ...base, battery: 14, latest: { moisture: 40, recordedAt: h(1) } })
		).toContain('low_battery');
	});
	it('null battery never alerts (HHCCJCY01 has no passive battery)', () => {
		expect(
			evaluateSensor({ ...base, battery: null, latest: { moisture: 40, recordedAt: h(1) } })
		).toEqual([]);
	});
	it('flags silence over 36h and suppresses stale moisture alerts', () => {
		const r = evaluateSensor({
			...base,
			lastSeenAt: h(37),
			latest: { moisture: 5, recordedAt: h(37) }
		});
		expect(r).toEqual(['sensor_silent']);
	});
	it('flags silence when never seen', () => {
		expect(evaluateSensor({ ...base, lastSeenAt: null, latest: null })).toEqual(['sensor_silent']);
	});
});

describe('alertDecision', () => {
	it('opens on new breach', () => expect(alertDecision(null, true, now)).toBe('open'));
	it('renotifies after 24h', () =>
		expect(alertDecision({ lastNotifiedAt: h(25) }, true, now)).toBe('renotify'));
	it('stays quiet within 24h', () =>
		expect(alertDecision({ lastNotifiedAt: h(23) }, true, now)).toBe('none'));
	it('resolves when breach clears', () =>
		expect(alertDecision({ lastNotifiedAt: h(1) }, false, now)).toBe('resolve'));
	it('no-ops when nothing open and nothing breached', () =>
		expect(alertDecision(null, false, now)).toBe('none'));
});
