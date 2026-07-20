import { desc, eq } from 'drizzle-orm';
import { db, sensors, readings } from './db';

export type ParsedReading = {
	mac: string;
	moisture: number | null;
	lux: number | null;
	tempC: number | null;
	fertility: number | null;
	battery: number | null;
};

const PLANT_MODELS = /^HHCCJCY/;

export function parseOmg(topic: string, payload: string): ParsedReading | null {
	if (!topic.includes('/BTtoMQTT/')) return null;
	let data: Record<string, unknown>;
	try {
		data = JSON.parse(payload);
	} catch {
		return null;
	}
	if (typeof data.id !== 'string' || !PLANT_MODELS.test(String(data.model_id ?? ''))) return null;
	const num = (v: unknown) => (typeof v === 'number' ? v : null);
	return {
		mac: data.id.replaceAll(':', '').toUpperCase(),
		moisture: num(data.moi),
		lux: num(data.lux),
		tempC: num(data.tempc),
		fertility: num(data.fer),
		battery: num(data.batt)
	};
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

export async function ingest(topic: string, payload: string, now = new Date()): Promise<void> {
	const single = parseOmg(topic, payload);
	if (!single) return;
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
