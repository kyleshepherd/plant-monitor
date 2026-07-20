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

export function parseOmg(topic: string, payload: string): ParsedReading | null {
	if (!topic.includes('/BTtoMQTT/')) return null;
	let data: Record<string, unknown>;
	try {
		data = JSON.parse(payload);
	} catch {
		return null;
	}
	// Broadcast decodes carry model_id; OMG's active-connect reads (battery) only carry model.
	const model = String(data.model_id ?? data.model ?? '');
	if (typeof data.id !== 'string' || !PLANT_MODELS.test(model)) return null;
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

// Seed the live snapshots from the latest stored readings so a fresh deploy
// shows last-known values (≤1h old) instead of dashes until re-broadcast.
export async function seedSnapshots(): Promise<void> {
	const rows = await db.select().from(sensors);
	for (const sensor of rows) {
		if (snapshots.has(sensor.mac)) continue;
		const [latest] = await db
			.select()
			.from(readings)
			.where(eq(readings.sensorId, sensor.id))
			.orderBy(desc(readings.recordedAt))
			.limit(1);
		if (!latest) continue;
		snapshots.set(sensor.mac, {
			mac: sensor.mac,
			moisture: latest.moisture,
			lux: latest.lux,
			tempC: latest.tempC,
			fertility: latest.fertility,
			battery: latest.battery ?? sensor.battery
		});
	}
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
