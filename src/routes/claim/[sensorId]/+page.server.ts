import { error, fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db, sensors, plants } from '$lib/server/db';
import { PRESETS, speciesThresholds } from '$lib/server/thresholds';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const [sensor] = await db.select().from(sensors).where(eq(sensors.id, Number(params.sensorId)));
	if (!sensor) error(404, 'No such sensor');
	return { sensor, presets: PRESETS };
};

export const actions: Actions = {
	default: async ({ request, params }) => {
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		if (!name) return fail(400, { message: 'Name required' });

		const speciesPid = String(form.get('speciesPid') ?? '');
		const preset = String(form.get('preset') ?? 'general') as keyof typeof PRESETS;
		const manualMin = form.get('moistureMin');
		const manualMax = form.get('moistureMax');

		let thresholds: { moistureMin: number; moistureMax: number } | null = null;
		let source = 'preset';
		if (speciesPid) {
			thresholds = await speciesThresholds(speciesPid);
			if (thresholds) source = 'openplantbook';
		}
		thresholds ??= PRESETS[preset] ?? PRESETS.general;
		if (manualMin && manualMax) {
			thresholds = { moistureMin: Number(manualMin), moistureMax: Number(manualMax) };
			source = 'manual';
		}

		await db.insert(plants).values({
			sensorId: Number(params.sensorId),
			name,
			species: speciesPid || null,
			sunlightNotes: String(form.get('sunlightNotes') ?? '') || null,
			moistureMin: thresholds.moistureMin,
			moistureMax: thresholds.moistureMax,
			thresholdSource: source
		});
		redirect(303, '/');
	}
};
