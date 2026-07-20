import { error, redirect } from '@sveltejs/kit';
import { and, desc, eq, gte } from 'drizzle-orm';
import { db, plants, sensors, readings, alerts } from '$lib/server/db';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const [row] = await db
		.select({ plant: plants, sensor: sensors })
		.from(plants)
		.innerJoin(sensors, eq(plants.sensorId, sensors.id))
		.where(eq(plants.id, Number(params.id)));
	if (!row) error(404, 'No such plant');

	const weekAgo = new Date(Date.now() - 7 * 86400_000);
	const history = await db
		.select()
		.from(readings)
		.where(and(eq(readings.sensorId, row.sensor.id), gte(readings.recordedAt, weekAgo)))
		.orderBy(readings.recordedAt);
	const alertLog = await db
		.select()
		.from(alerts)
		.where(eq(alerts.sensorId, row.sensor.id))
		.orderBy(desc(alerts.createdAt))
		.limit(20);
	return { ...row, history, alertLog };
};

export const actions: Actions = {
	thresholds: async ({ request, params }) => {
		const form = await request.formData();
		await db
			.update(plants)
			.set({
				moistureMin: Number(form.get('moistureMin')),
				moistureMax: Number(form.get('moistureMax')),
				thresholdSource: 'manual'
			})
			.where(eq(plants.id, Number(params.id)));
		redirect(303, `/plants/${params.id}`);
	},
	unclaim: async ({ params }) => {
		const id = Number(params.id);
		const [plant] = await db.select().from(plants).where(eq(plants.id, id));
		if (plant) {
			await db.update(alerts).set({ resolvedAt: new Date() }).where(eq(alerts.plantId, id));
			await db.delete(plants).where(eq(plants.id, id));
		}
		redirect(303, '/');
	}
};
