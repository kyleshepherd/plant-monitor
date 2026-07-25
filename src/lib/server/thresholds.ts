import { env } from '$env/dynamic/private';

export const PRESETS = {
	succulent: { moistureMin: 10, moistureMax: 50 },
	tropical: { moistureMin: 30, moistureMax: 65 },
	fern: { moistureMin: 35, moistureMax: 70 },
	herb: { moistureMin: 25, moistureMax: 60 },
	general: { moistureMin: 20, moistureMax: 60 }
} as const satisfies Record<string, { moistureMin: number; moistureMax: number }>;

const BASE = 'https://open.plantbook.io/api/v1/plant';
const headers = () => ({ Authorization: `Token ${env.OPENPLANTBOOK_API_KEY ?? ''}` });

export async function searchSpecies(
	q: string,
	fetchFn: typeof fetch = fetch
): Promise<{ pid: string; display: string }[]> {
	try {
		const res = await fetchFn(`${BASE}/search?alias=${encodeURIComponent(q)}`, {
			headers: headers()
		});
		if (!res.ok) return [];
		const data = await res.json();
		return (data.results ?? []).map((r: { pid: string; display_pid?: string }) => ({
			pid: r.pid,
			display: r.display_pid ?? r.pid
		}));
	} catch {
		return [];
	}
}

export async function speciesThresholds(
	pid: string,
	fetchFn: typeof fetch = fetch
): Promise<{ moistureMin: number; moistureMax: number } | null> {
	try {
		const res = await fetchFn(`${BASE}/detail/${encodeURIComponent(pid)}/`, {
			headers: headers()
		});
		if (!res.ok) return null;
		const data = await res.json();
		if (typeof data.min_soil_moist !== 'number' || typeof data.max_soil_moist !== 'number')
			return null;
		return { moistureMin: data.min_soil_moist, moistureMax: data.max_soil_moist };
	} catch {
		return null;
	}
}

async function detailImage(pid: string, fetchFn: typeof fetch): Promise<string | null> {
	const res = await fetchFn(`${BASE}/detail/${encodeURIComponent(pid)}/`, { headers: headers() });
	if (!res.ok) return null;
	const data = await res.json();
	return typeof data.image_url === 'string' && data.image_url ? data.image_url : null;
}

// Resolve a species photo from OpenPlantbook. `species` may be an exact pid
// (from the search picker) or free text — falls back to a search to find the pid.
export async function speciesImage(
	species: string | null | undefined,
	fetchFn: typeof fetch = fetch
): Promise<string | null> {
	if (!species) return null;
	try {
		const direct = await detailImage(species, fetchFn);
		if (direct) return direct;
		const [first] = await searchSpecies(species, fetchFn);
		return first ? await detailImage(first.pid, fetchFn) : null;
	} catch {
		return null;
	}
}
