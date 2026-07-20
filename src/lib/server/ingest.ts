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

export async function ingest(topic: string, payload: string, now = new Date()): Promise<void> {
	const parsed = parseOmg(topic, payload);
	if (!parsed) return;

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
