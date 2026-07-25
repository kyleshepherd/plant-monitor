// Care guidance for sensorless "manual" plants tracked by eye with a
// SUStee-style soil indicator (window turns blue when wet, white when dry).
export const CARE_CATEGORIES = ['succulent', 'tropical', 'fern', 'herb', 'general'] as const;
export type CareCategory = (typeof CARE_CATEGORIES)[number];

const RULES: Record<CareCategory, { short: string; detail: string }> = {
	succulent: {
		short: 'Let it go fully white, then wait ~3–5 days',
		detail: 'Drought-tolerant — it wants to dry out completely. Watering the moment it turns white slowly overwaters it.'
	},
	tropical: {
		short: 'Water when the window turns white',
		detail: 'Likes evenly moist soil. Top up as soon as the indicator loses its blue.'
	},
	fern: {
		short: "Water when it's half-faded — don't let it fully dry",
		detail: 'Thirsty and unforgiving of drought. Water before the window goes fully white.'
	},
	herb: {
		short: 'Water when the window turns white',
		detail: 'Water on white; most kitchen herbs like a drink promptly but not soggy roots.'
	},
	general: {
		short: 'Water when the window turns white',
		detail: 'Sensible default: white means water now, blue means it still has enough.'
	}
};

export function careRule(category: string | null | undefined): { short: string; detail: string } {
	return RULES[(category ?? '') as CareCategory] ?? RULES.general;
}

export function wateredAgo(lastWateredAt: Date | null, now = new Date()): string {
	if (!lastWateredAt) return 'never';
	const days = Math.floor((now.getTime() - new Date(lastWateredAt).getTime()) / 86400_000);
	if (days <= 0) return 'today';
	if (days === 1) return '1 day ago';
	return `${days} days ago`;
}
