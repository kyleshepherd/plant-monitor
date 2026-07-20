import { describe, it, expect } from 'vitest';
import { parseOmg, shouldStoreReading } from '../src/lib/server/ingest';

const TOPIC = 'home/OMG_ESP32_BLE/BTtoMQTT/C47C8D6D5E2F';
const FLORA = JSON.stringify({
	id: 'C4:7C:8D:6D:5E:2F',
	name: 'Flower care',
	model: 'MiFlora',
	model_id: 'HHCCJCY01HHCC',
	tempc: 22.6,
	tempf: 72.68,
	moi: 27,
	lux: 1024,
	fer: 86
});

describe('parseOmg', () => {
	it('parses a MiFlora payload', () => {
		expect(parseOmg(TOPIC, FLORA)).toEqual({
			mac: 'C47C8D6D5E2F',
			moisture: 27,
			lux: 1024,
			tempC: 22.6,
			fertility: 86,
			battery: null
		});
	});
	it('includes battery when present (HHCCJCY10)', () => {
		const p = JSON.stringify({ id: 'C4:7C:8D:6D:5E:2F', model_id: 'HHCCJCY10', moi: 40, batt: 92 });
		expect(parseOmg(TOPIC, p)?.battery).toBe(92);
	});
	it('returns null for non-sensor messages (gateway status, other devices)', () => {
		expect(parseOmg('home/OMG_ESP32_BLE/LWT', 'online')).toBeNull();
		expect(
			parseOmg(TOPIC, JSON.stringify({ id: 'AA:BB:CC:DD:EE:FF', model_id: 'MUE4094RT' }))
		).toBeNull();
		expect(parseOmg(TOPIC, 'not json')).toBeNull();
	});
});

describe('shouldStoreReading', () => {
	const now = new Date('2026-07-20T12:00:00Z');
	it('stores when never stored', () => expect(shouldStoreReading(null, now)).toBe(true));
	it('skips within an hour', () =>
		expect(shouldStoreReading(new Date('2026-07-20T11:30:00Z'), now)).toBe(false));
	it('stores after an hour', () =>
		expect(shouldStoreReading(new Date('2026-07-20T10:59:00Z'), now)).toBe(true));
});
