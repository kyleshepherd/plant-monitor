import { json } from '@sveltejs/kit';
import { searchSpecies } from '$lib/server/thresholds';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const q = url.searchParams.get('q') ?? '';
	return json(q.length < 2 ? [] : await searchSpecies(q));
};
