import { and, desc, eq, isNull } from 'drizzle-orm';
import { db, sensors, readings, plants, alerts } from './db';

export type ParsedReading = {
	mac: string;
	moisture: number | null;
	lux: number | null;
	tempC: number | null;
	fertility: number | null;
	battery: number | null;
};

const PLANT_MODELS = /^HHCCJCY/;

// Some Flower Care units broadcast an older MiBeacon dialect the gateway's
// decoder doesn't recognize; with pubadvdata enabled the gateway forwards the
// raw fe95 service data and we parse the TLV objects ourselves.
// Layout: frctrl(2) product(2) framecnt(1) mac(6, reversed) [capability(1)]
// then TLVs of [objectId(2 LE, 0x10XX) len(1) value(len)].
function parseMiBeacon(mac: string, hex: string): ParsedReading | null {
	const buf = Buffer.from(hex, 'hex');
	if (buf.length < 14) return null;
	const macReversed = Buffer.from(mac, 'hex').reverse().toString('hex');
	if (buf.subarray(5, 11).toString('hex') !== macReversed) return null;

	let off = 11;
	if (buf[off + 1] !== 0x10) off += 1; // skip capability byte when present
	const out: ParsedReading = { mac, moisture: null, lux: null, tempC: null, fertility: null, battery: null };
	let found = false;
	while (off + 3 <= buf.length && buf[off + 1] === 0x10) {
		const objectId = buf.readUInt16LE(off);
		const len = buf[off + 2];
		const val = buf.subarray(off + 3, off + 3 + len);
		if (val.length !== len) break;
		switch (objectId) {
			case 0x1004: out.tempC = val.readInt16LE(0) / 10; found = true; break;
			case 0x1007: out.lux = val.readUIntLE(0, Math.min(len, 3)); found = true; break;
			case 0x1008: out.moisture = val[0]; found = true; break;
			case 0x1009: out.fertility = val.readUInt16LE(0); found = true; break;
			case 0x100a: out.battery = val[0]; found = true; break;
		}
		off += 3 + len;
	}
	return found ? out : null;
}

export function parseOmg(topic: string, payload: string): ParsedReading | null {
	if (!topic.includes('/BTtoMQTT/')) return null;
	let data: Record<string, unknown>;
	try {
		data = JSON.parse(payload);
	} catch {
		return null;
	}
	if (typeof data.id !== 'string') return null;
	const mac = data.id.replaceAll(':', '').toUpperCase();
	// Broadcast decodes carry model_id; OMG's active-connect reads (battery) only carry model.
	const model = String(data.model_id ?? data.model ?? '');
	if (PLANT_MODELS.test(model)) {
		const num = (v: unknown) => (typeof v === 'number' ? v : null);
		return {
			mac,
			moisture: num(data.moi),
			lux: num(data.lux),
			tempC: num(data.tempc),
			fertility: num(data.fer),
			battery: num(data.batt)
		};
	}
	// Undecoded device: try raw Xiaomi service data (uuid 0xfe95)
	if (data.servicedatauuid === '0xfe95' && typeof data.servicedata === 'string') {
		try {
			return parseMiBeacon(mac, data.servicedata);
		} catch {
			return null;
		}
	}
	return null;
}

const HOUR_MS = 60 * 60 * 1000;

export function shouldStoreReading(lastStoredAt: Date | null, now: Date): boolean {
	return !lastStoredAt || now.getTime() - lastStoredAt.getTime() >= HOUR_MS;
}

// Real HHCCJCY01 sensors broadcast ONE metric per BLE advertisement (lux in one
// packet, moisture in the next, ...). Merge packets into a rolling snapshot per
// sensor so stored readings carry all metrics, not whichever packet came first.
export function mergeReading(prev: ParsedReading | null, next: ParsedReading): ParsedReading {
	if (!prev) return next;
	return {
		mac: next.mac,
		moisture: next.moisture ?? prev.moisture,
		lux: next.lux ?? prev.lux,
		tempC: next.tempC ?? prev.tempC,
		fertility: next.fertility ?? prev.fertility,
		battery: next.battery ?? prev.battery
	};
}

const snapshots = new Map<string, ParsedReading>();

// Live merged state for a sensor — fresher than the hourly stored reading.
export function currentSnapshot(mac: string): ParsedReading | undefined {
	return snapshots.get(mac);
}

export type LiveReading = {
	moisture: number | null;
	lux: number | null;
	tempC: number | null;
	fertility: number | null;
	battery: number | null;
};

// The value to show/judge: the live in-memory snapshot, falling back per-metric
// to the latest stored reading. This is what both the dashboard and the alert
// evaluator should use so "what you see" matches "what alerts".
export function liveReading(mac: string, stored: Partial<LiveReading> | null): LiveReading | null {
	const snap = currentSnapshot(mac);
	if (!snap && !stored) return null;
	return {
		moisture: snap?.moisture ?? stored?.moisture ?? null,
		lux: snap?.lux ?? stored?.lux ?? null,
		tempC: snap?.tempC ?? stored?.tempC ?? null,
		fertility: snap?.fertility ?? stored?.fertility ?? null,
		battery: snap?.battery ?? stored?.battery ?? null
	};
}

// Seed the live snapshots from stored readings so a fresh deploy shows
// last-known values instead of dashes until re-broadcast. Coalesces across the
// last day of rows (individual rows can be sparse), and merges UNDER any value
// a live broadcast has already delivered since boot.
export async function seedSnapshots(): Promise<void> {
	const rows = await db.select().from(sensors);
	for (const sensor of rows) {
		const recent = await db
			.select()
			.from(readings)
			.where(eq(readings.sensorId, sensor.id))
			.orderBy(desc(readings.recordedAt))
			.limit(24);
		if (!recent.length) continue;
		let seeded: ParsedReading = {
			mac: sensor.mac,
			moisture: null,
			lux: null,
			tempC: null,
			fertility: null,
			battery: sensor.battery
		};
		for (const r of recent.reverse()) {
			seeded = mergeReading(seeded, {
				mac: sensor.mac,
				moisture: r.moisture,
				lux: r.lux,
				tempC: r.tempC,
				fertility: r.fertility,
				battery: r.battery
			});
		}
		// live values (arrived since boot) win over seeded ones
		snapshots.set(sensor.mac, mergeReading(seeded, snapshots.get(sensor.mac) ?? seeded));
	}
}

// Last time any plant sensor broadcast reached us (boot time until one does) —
// the gateway watchdog's signal that the hub is still forwarding.
let lastHeardAt = Date.now();

export function lastSensorHeardAt(): number {
	return lastHeardAt;
}

export async function ingest(topic: string, payload: string, now = new Date()): Promise<void> {
	const single = parseOmg(topic, payload);
	if (!single) return;
	lastHeardAt = now.getTime();
	const parsed = mergeReading(snapshots.get(single.mac) ?? null, single);
	snapshots.set(single.mac, parsed);

	const [sensor] = await db
		.insert(sensors)
		.values({ mac: parsed.mac, lastSeenAt: now, battery: parsed.battery })
		.onConflictDoUpdate({
			target: sensors.mac,
			set: { lastSeenAt: now, ...(parsed.battery !== null ? { battery: parsed.battery } : {}) }
		})
		.returning();

	// Eagerly resolve an open low_moisture alert as soon as a fresh reading shows
	// the plant is back above its minimum — don't make the user wait for the
	// hourly evaluation to see "watered" reflected.
	if (parsed.moisture !== null) {
		const [open] = await db
			.select({ alertId: alerts.id, moistureMin: plants.moistureMin })
			.from(alerts)
			.innerJoin(plants, eq(alerts.plantId, plants.id))
			.where(
				and(
					eq(alerts.sensorId, sensor.id),
					eq(alerts.type, 'low_moisture'),
					isNull(alerts.resolvedAt)
				)
			);
		if (open && parsed.moisture >= open.moistureMin) {
			await db.update(alerts).set({ resolvedAt: now }).where(eq(alerts.id, open.alertId));
		}
	}

	const [latest] = await db
		.select({ recordedAt: readings.recordedAt })
		.from(readings)
		.where(eq(readings.sensorId, sensor.id))
		.orderBy(desc(readings.recordedAt))
		.limit(1);

	if (!shouldStoreReading(latest?.recordedAt ?? null, now)) return;

	await db.insert(readings).values({
		sensorId: sensor.id,
		moisture: parsed.moisture,
		lux: parsed.lux,
		tempC: parsed.tempC,
		fertility: parsed.fertility,
		battery: parsed.battery,
		recordedAt: now
	});
}
