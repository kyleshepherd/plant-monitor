import { desc, eq, isNull } from 'drizzle-orm';
import { db, sensors, plants, readings } from '$lib/server/db';
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
			return { ...row, latest: latest ?? null };
		})
	);

	const unclaimed = await db
		.select()
		.from(sensors)
		.leftJoin(plants, eq(plants.sensorId, sensors.id))
		.where(isNull(plants.id));

	return { plants: withLatest, unclaimed: unclaimed.map((u) => u.sensors) };
};
