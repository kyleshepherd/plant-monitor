import { describe, it, expect } from 'vitest';
import { CARE_CATEGORIES, careRule, wateredAgo } from '../src/lib/server/care';

describe('careRule', () => {
	it('has a rule for every category', () => {
		for (const c of CARE_CATEGORIES) {
			expect(careRule(c).short.length).toBeGreaterThan(0);
		}
	});
	it('tells drought-tolerant plants to wait after white', () => {
		expect(careRule('succulent').short.toLowerCase()).toContain('wait');
	});
	it('tells thirsty plants not to fully dry out', () => {
		expect(careRule('fern').short.toLowerCase()).toMatch(/half|before|fully/);
	});
	it('falls back to the general rule for unknown/null category', () => {
		expect(careRule(null)).toEqual(careRule('general'));
		expect(careRule('nonsense')).toEqual(careRule('general'));
	});
});

describe('wateredAgo', () => {
	const now = new Date('2026-07-23T12:00:00Z');
	it('reads never when null', () => expect(wateredAgo(null, now)).toBe('never'));
	it('reads today for <1 day', () =>
		expect(wateredAgo(new Date('2026-07-23T08:00:00Z'), now)).toBe('today'));
	it('reads 1 day ago', () =>
		expect(wateredAgo(new Date('2026-07-22T08:00:00Z'), now)).toBe('1 day ago'));
	it('reads N days ago', () =>
		expect(wateredAgo(new Date('2026-07-19T08:00:00Z'), now)).toBe('4 days ago'));
});
