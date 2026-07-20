import { describe, it, expect } from 'vitest';
import { parseOmg, mergeReading, shouldStoreReading } from '../src/lib/server/ingest';

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
	it('parses OMG active-connect battery messages (model, no model_id)', () => {
		const p = JSON.stringify({ model: 'HHCCJCY01HHCC', id: '5C:85:7E:13:4D:23', batt: 100 });
		expect(parseOmg(TOPIC, p)).toEqual({
			mac: '5C857E134D23',
			moisture: null,
			lux: null,
			tempC: null,
			fertility: null,
			battery: 100
		});
	});
	it('returns null for non-sensor messages (gateway status, other devices)', () => {
		expect(parseOmg('home/OMG_ESP32_BLE/LWT', 'online')).toBeNull();
		expect(
			parseOmg(TOPIC, JSON.stringify({ id: 'AA:BB:CC:DD:EE:FF', model_id: 'MUE4094RT' }))
		).toBeNull();
		expect(parseOmg(TOPIC, 'not json')).toBeNull();
	});
});

describe('parseOmg — raw MiBeacon servicedata (older-dialect Flower Care)', () => {
	// real packets captured from sensor 5C:85:7E:13:6C:BA on 2026-07-20
	const raw = (servicedata: string) =>
		JSON.stringify({
			id: '5C:85:7E:13:6C:BA',
			name: 'Flower care',
			rssi: -80,
			servicedata,
			servicedatauuid: '0xfe95'
		});
	it('parses a moisture packet', () => {
		expect(parseOmg(TOPIC, raw('7120980055ba6c137e855c0d08100101'))).toEqual({
			mac: '5C857E136CBA',
			moisture: 1,
			lux: null,
			tempC: null,
			fertility: null,
			battery: null
		});
	});
	it('parses a lux packet', () => {
		expect(parseOmg(TOPIC, raw('712098005cba6c137e855c0d0710039c0600'))?.lux).toBe(1692);
	});
	it('parses a conductivity packet', () => {
		expect(parseOmg(TOPIC, raw('7120980062ba6c137e855c0d0910020000'))?.fertility).toBe(0);
	});
	it('parses a temperature packet (0x1004, int16 LE / 10)', () => {
		// synthetic: same header, obj 0x1004 len 2 value 0xDE 0x00 = 222 -> 22.2°C
		expect(parseOmg(TOPIC, raw('7120980063ba6c137e855c0d041002de00'))?.tempC).toBe(22.2);
	});
	it('ignores non-fe95 servicedata and junk', () => {
		expect(
			parseOmg(TOPIC, JSON.stringify({ id: 'AA:BB:CC:DD:EE:FF', servicedata: 'ffff', servicedatauuid: '0x1809' }))
		).toBeNull();
		expect(parseOmg(TOPIC, raw('7120'))).toBeNull();
	});
});

describe('mergeReading', () => {
	it('accumulates single-metric broadcasts into one snapshot (real HHCCJCY01 behaviour)', () => {
		const a = parseOmg(TOPIC, JSON.stringify({ id: 'C4:7C:8D:6D:5E:2F', model_id: 'HHCCJCY01HHCC', lux: 812 }))!;
		const b = parseOmg(TOPIC, JSON.stringify({ id: 'C4:7C:8D:6D:5E:2F', model_id: 'HHCCJCY01HHCC', moi: 31 }))!;
		const c = parseOmg(TOPIC, JSON.stringify({ id: 'C4:7C:8D:6D:5E:2F', model_id: 'HHCCJCY01HHCC', tempc: 22.1 }))!;
		let snap = mergeReading(null, a);
		snap = mergeReading(snap, b);
		snap = mergeReading(snap, c);
		expect(snap).toEqual({ mac: 'C47C8D6D5E2F', moisture: 31, lux: 812, tempC: 22.1, fertility: null, battery: null });
	});
	it('newer values overwrite older ones, nulls never overwrite', () => {
		const first = parseOmg(TOPIC, JSON.stringify({ id: 'C4:7C:8D:6D:5E:2F', model_id: 'HHCCJCY01HHCC', moi: 31 }))!;
		const second = parseOmg(TOPIC, JSON.stringify({ id: 'C4:7C:8D:6D:5E:2F', model_id: 'HHCCJCY01HHCC', moi: 28 }))!;
		const other = parseOmg(TOPIC, JSON.stringify({ id: 'C4:7C:8D:6D:5E:2F', model_id: 'HHCCJCY01HHCC', lux: 500 }))!;
		expect(mergeReading(mergeReading(first, second), other).moisture).toBe(28);
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
