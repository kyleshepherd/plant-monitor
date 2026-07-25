import { and, desc, eq, isNull } from 'drizzle-orm';
import { db, sensors, plants, readings, alerts } from '$lib/server/db';
import { liveReading } from '$lib/server/ingest';
import { careRule, wateredAgo } from '$lib/server/care';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const rows = await db
		.select({ plant: plants, sensor: sensors })
		.from(plants)
		.leftJoin(sensors, eq(plants.sensorId, sensors.id))
		.orderBy(plants.createdAt);

	const withData = await Promise.all(
		rows.map(async (row) => {
			// Manual (sensorless) plant — no readings, just care/watering info.
			if (!row.sensor) {
				return {
					plant: row.plant,
					sensor: null,
					latest: null,
					history: [] as { moisture: number | null; recordedAt: Date }[],
					openAlert: null,
					manual: true as const,
					care: careRule(row.plant.careCategory),
					wateredAgo: wateredAgo(row.plant.lastWateredAt)
				};
			}
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
				.limit(84);
			const [openAlert] = await db
				.select()
				.from(alerts)
				.where(and(eq(alerts.sensorId, row.sensor.id), isNull(alerts.resolvedAt)))
				.limit(1);
			return {
				plant: row.plant,
				sensor: row.sensor,
				latest: liveReading(row.sensor.mac, latest ?? null),
				history: history.reverse(),
				openAlert: openAlert ?? null,
				manual: false as const
			};
		})
	);

	const unclaimed = await db
		.select()
		.from(sensors)
		.leftJoin(plants, eq(plants.sensorId, sensors.id))
		.where(isNull(plants.id));

	return { plants: withData, unclaimed: unclaimed.map((u) => u.sensors) };
};

export const actions: Actions = {
	watered: async ({ request }) => {
		const form = await request.formData();
		const id = Number(form.get('plantId'));
		if (id) await db.update(plants).set({ lastWateredAt: new Date() }).where(eq(plants.id, id));
	}
};
