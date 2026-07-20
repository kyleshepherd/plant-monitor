import { describe, it, expect, vi } from 'vitest';
import { PRESETS, searchSpecies, speciesThresholds } from '../src/lib/server/thresholds';

describe('PRESETS', () => {
	it('has all five categories with sane ranges', () => {
		for (const key of ['succulent', 'tropical', 'fern', 'herb', 'general'] as const) {
			const p = PRESETS[key];
			expect(p.moistureMin).toBeGreaterThan(0);
			expect(p.moistureMax).toBeGreaterThan(p.moistureMin);
		}
	});
});

describe('speciesThresholds', () => {
	it('maps OpenPlantbook fields', async () => {
		const fetchFn = vi
			.fn()
			.mockResolvedValue(
				new Response(
					JSON.stringify({ pid: 'monstera deliciosa', min_soil_moist: 25, max_soil_moist: 65 })
				)
			);
		expect(
			await speciesThresholds('monstera deliciosa', fetchFn as unknown as typeof fetch)
		).toEqual({ moistureMin: 25, moistureMax: 65 });
	});
	it('returns null when the API fails', async () => {
		const fetchFn = vi.fn().mockResolvedValue(new Response('nope', { status: 500 }));
		expect(await speciesThresholds('x', fetchFn as unknown as typeof fetch)).toBeNull();
	});
	it('returns null when fetch throws (API down)', async () => {
		const fetchFn = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
		expect(await speciesThresholds('x', fetchFn as unknown as typeof fetch)).toBeNull();
	});
});

describe('searchSpecies', () => {
	it('maps results and returns [] on failure', async () => {
		const ok = vi
			.fn()
			.mockResolvedValue(
				new Response(
					JSON.stringify({ results: [{ pid: 'ficus lyrata', display_pid: 'Ficus lyrata' }] })
				)
			);
		expect(await searchSpecies('ficus', ok as unknown as typeof fetch)).toEqual([
			{ pid: 'ficus lyrata', display: 'Ficus lyrata' }
		]);
		const bad = vi.fn().mockRejectedValue(new Error('down'));
		expect(await searchSpecies('ficus', bad as unknown as typeof fetch)).toEqual([]);
	});
});
