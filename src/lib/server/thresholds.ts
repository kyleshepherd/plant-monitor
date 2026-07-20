import { env } from '$env/dynamic/private';

export const PRESETS = {
	succulent: { moistureMin: 10, moistureMax: 50 },
	tropical: { moistureMin: 30, moistureMax: 65 },
	fern: { moistureMin: 35, moistureMax: 70 },
	herb: { moistureMin: 25, moistureMax: 60 },
	general: { moistureMin: 20, moistureMax: 60 }
} as const satisfies Record<string, { moistureMin: number; moistureMax: number }>;

const BASE = 'https://open.plantbook.io/api/v1/plant';
const headers = () => ({ 'X-API-Key': env.OPENPLANTBOOK_API_KEY ?? '' });

export async function searchSpecies(
	q: string,
	fetchFn: typeof fetch = fetch
): Promise<{ pid: string; display: string }[]> {
	try {
		const res = await fetchFn(`${BASE}/search?q=${encodeURIComponent(q)}`, { headers: headers() });
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
		const res = await fetchFn(`${BASE}/detail/${encodeURIComponent(pid)}`, { headers: headers() });
		if (!res.ok) return null;
		const data = await res.json();
		if (typeof data.min_soil_moist !== 'number' || typeof data.max_soil_moist !== 'number')
			return null;
		return { moistureMin: data.min_soil_moist, moistureMax: data.max_soil_moist };
	} catch {
		return null;
	}
}
