import { and, desc, eq, isNull } from 'drizzle-orm';
import { db, sensors, plants, readings, alerts } from '$lib/server/db';
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
			return {
				...row,
				latest: latest ?? null,
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
