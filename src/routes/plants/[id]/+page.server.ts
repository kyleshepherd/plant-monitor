import { error, fail, redirect } from '@sveltejs/kit';
import { and, desc, eq, gte } from 'drizzle-orm';
import { db, plants, sensors, readings, alerts } from '$lib/server/db';
import { liveReading } from '$lib/server/ingest';
import { careRule, wateredAgo, CARE_CATEGORIES } from '$lib/server/care';
import { speciesImage } from '$lib/server/thresholds';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const [row] = await db
		.select({ plant: plants, sensor: sensors })
		.from(plants)
		.leftJoin(sensors, eq(plants.sensorId, sensors.id))
		.where(eq(plants.id, Number(params.id)));
	if (!row) error(404, 'No such plant');

	// Manual (sensorless) plant — care card + watering log, no readings.
	if (!row.sensor) {
		return {
			plant: row.plant,
			sensor: null,
			manual: true as const,
			care: careRule(row.plant.careCategory),
			wateredAgo: wateredAgo(row.plant.lastWateredAt),
			categories: CARE_CATEGORIES,
			latest: null,
			history: [] as (typeof readings.$inferSelect)[],
			alertLog: [] as (typeof alerts.$inferSelect)[]
		};
	}

	const [stored] = await db
		.select()
		.from(readings)
		.where(eq(readings.sensorId, row.sensor.id))
		.orderBy(desc(readings.recordedAt))
		.limit(1);

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
	return {
		plant: row.plant,
		sensor: row.sensor,
		manual: false as const,
		latest: liveReading(row.sensor.mac, stored ?? null),
		history,
		alertLog
	};
};

export const actions: Actions = {
	details: async ({ request, params }) => {
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		if (!name) return fail(400, { message: 'Name required' });
		const category = form.get('category');
		const species = String(form.get('species') ?? '').trim() || null;
		await db
			.update(plants)
			.set({
				name,
				species,
				sunlightNotes: String(form.get('sunlightNotes') ?? '').trim() || null,
				imageUrl: await speciesImage(species),
				...(category ? { careCategory: String(category) } : {})
			})
			.where(eq(plants.id, Number(params.id)));
		redirect(303, `/plants/${params.id}`);
	},
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
	watered: async ({ params }) => {
		await db
			.update(plants)
			.set({ lastWateredAt: new Date() })
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
	},
	// Manual plants have no sensor to unclaim — just delete the plant.
	delete: async ({ params }) => {
		await db.delete(plants).where(eq(plants.id, Number(params.id)));
		redirect(303, '/');
	}
};
