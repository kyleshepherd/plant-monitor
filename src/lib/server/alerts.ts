import { and, desc, eq, isNull } from 'drizzle-orm';
import { db, sensors, plants, readings, alerts } from './db';

export type AlertType = 'low_moisture' | 'low_battery' | 'sensor_silent';

const BATTERY_MIN = 15;
const SILENT_MS = 36 * 3600_000;
const RENOTIFY_MS = 24 * 3600_000;

export function evaluateSensor(input: {
	moistureMin: number;
	latest: { moisture: number | null; recordedAt: Date } | null;
	battery: number | null;
	lastSeenAt: Date | null;
	now: Date;
}): AlertType[] {
	const { moistureMin, latest, battery, lastSeenAt, now } = input;
	if (!lastSeenAt || now.getTime() - lastSeenAt.getTime() > SILENT_MS) return ['sensor_silent'];
	const out: AlertType[] = [];
	if (latest?.moisture != null && latest.moisture < moistureMin) out.push('low_moisture');
	if (battery != null && battery < BATTERY_MIN) out.push('low_battery');
	return out;
}

export function alertDecision(
	existing: { lastNotifiedAt: Date | null } | null,
	breached: boolean,
	now: Date
): 'open' | 'renotify' | 'none' | 'resolve' {
	if (breached && !existing) return 'open';
	if (!breached && existing) return 'resolve';
	if (breached && existing) {
		const last = existing.lastNotifiedAt?.getTime() ?? 0;
		return now.getTime() - last >= RENOTIFY_MS ? 'renotify' : 'none';
	}
	return 'none';
}

const MESSAGES: Record<AlertType, (plant: string) => { title: string; body: string }> = {
	low_moisture: (p) => ({
		title: `💧 ${p} needs water`,
		body: 'Soil moisture is below its minimum.'
	}),
	low_battery: (p) => ({
		title: `🔋 ${p}'s sensor battery is low`,
		body: 'Replace the CR2032 soon.'
	}),
	sensor_silent: (p) => ({
		title: `📡 ${p}'s sensor is silent`,
		body: 'No readings for over 36 hours — check the sensor and hub.'
	})
};

const ALL_TYPES: AlertType[] = ['low_moisture', 'low_battery', 'sensor_silent'];

export async function runEvaluation(
	notify: (title: string, body: string) => Promise<void>,
	now = new Date()
): Promise<void> {
	const rows = await db
		.select({ plant: plants, sensor: sensors })
		.from(plants)
		.innerJoin(sensors, eq(plants.sensorId, sensors.id));

	for (const { plant, sensor } of rows) {
		const [latest] = await db
			.select({ moisture: readings.moisture, recordedAt: readings.recordedAt })
			.from(readings)
			.where(eq(readings.sensorId, sensor.id))
			.orderBy(desc(readings.recordedAt))
			.limit(1);

		const active = evaluateSensor({
			moistureMin: plant.moistureMin,
			latest: latest ?? null,
			battery: sensor.battery,
			lastSeenAt: sensor.lastSeenAt,
			now
		});

		for (const type of ALL_TYPES) {
			const [existing] = await db
				.select()
				.from(alerts)
				.where(
					and(eq(alerts.sensorId, sensor.id), eq(alerts.type, type), isNull(alerts.resolvedAt))
				);

			const decision = alertDecision(existing ?? null, active.includes(type), now);
			if (decision === 'none') continue;

			if (decision === 'resolve') {
				await db.update(alerts).set({ resolvedAt: now }).where(eq(alerts.id, existing.id));
				continue;
			}

			const { title, body } = MESSAGES[type](plant.name);
			await notify(title, body);
			if (decision === 'open') {
				await db
					.insert(alerts)
					.values({ sensorId: sensor.id, plantId: plant.id, type, lastNotifiedAt: now });
			} else {
				await db.update(alerts).set({ lastNotifiedAt: now }).where(eq(alerts.id, existing.id));
			}
		}
	}
}
