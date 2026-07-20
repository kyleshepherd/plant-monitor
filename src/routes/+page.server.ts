import { and, desc, eq, isNull } from 'drizzle-orm';
import { db, sensors, plants, readings, alerts } from '$lib/server/db';
import { currentSnapshot } from '$lib/server/ingest';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const claimed = await db
		.select({ plant: plants, sensor: sensors })
		.from(plants)
		.innerJoin(sensors, eq(plants.sensorId, sensors.id));

	const withLatest = await Promise.all(
		claimed.map(async (row) => {
			const [latest] = await db
				.select()
				.from(readings)
				.where(eq(readings.sensorId, row.sensor.id))
				.orderBy(desc(readings.recordedAt))
				.limit(1);
			const history = await db
				.select({ moisture: readings.moisture, recordedAt: readings.recordedAt })
				.from(readings)
				.where(eq(readings.sensorId, row.sensor.id))
				.orderBy(desc(readings.recordedAt))
				.limit(84); // ~7 days of hourly readings
			const [openAlert] = await db
				.select()
				.from(alerts)
				.where(and(eq(alerts.sensorId, row.sensor.id), isNull(alerts.resolvedAt)))
				.limit(1);
			// Overlay the live in-memory snapshot: fresher than the hourly stored reading.
			const snap = currentSnapshot(row.sensor.mac);
			const merged = snap
				? {
						moisture: snap.moisture ?? latest?.moisture ?? null,
						lux: snap.lux ?? latest?.lux ?? null,
						tempC: snap.tempC ?? latest?.tempC ?? null,
						fertility: snap.fertility ?? latest?.fertility ?? null,
						battery: snap.battery ?? latest?.battery ?? null
					}
				: (latest ?? null);
			return {
				...row,
				latest: merged,
				history: history.reverse(),
				openAlert: openAlert ?? null
			};
		})
	);

	const unclaimed = await db
		.select()
		.from(sensors)
		.leftJoin(plants, eq(plants.sensorId, sensors.id))
		.where(isNull(plants.id));

	return { plants: withLatest, unclaimed: unclaimed.map((u) => u.sensors) };
};
