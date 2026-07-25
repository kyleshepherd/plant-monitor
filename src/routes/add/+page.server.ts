import { fail, redirect } from '@sveltejs/kit';
import { db, plants } from '$lib/server/db';
import { PRESETS } from '$lib/server/thresholds';
import { CARE_CATEGORIES } from '$lib/server/care';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	return { categories: CARE_CATEGORIES };
};

export const actions: Actions = {
	default: async ({ request }) => {
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		if (!name) return fail(400, { message: 'Name required' });

		const category = String(form.get('category') ?? 'general');
		const preset = PRESETS[category as keyof typeof PRESETS] ?? PRESETS.general;

		await db.insert(plants).values({
			sensorId: null,
			name,
			species: String(form.get('species') ?? '').trim() || null,
			sunlightNotes: String(form.get('sunlightNotes') ?? '').trim() || null,
			// moisture columns are required but unused for manual plants; seed from the preset
			moistureMin: preset.moistureMin,
			moistureMax: preset.moistureMax,
			thresholdSource: 'preset',
			careCategory: category
		});
		redirect(303, '/');
	}
};
