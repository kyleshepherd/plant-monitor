import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';

export function sessionToken(): string {
	return createHmac('sha256', env.AUTH_SECRET).update('plant-monitor-session-v1').digest('hex');
}

export function isAuthed(cookieValue: string | undefined): boolean {
	if (!cookieValue) return false;
	const expected = Buffer.from(sessionToken());
	const actual = Buffer.from(cookieValue);
	return actual.length === expected.length && timingSafeEqual(actual, expected);
}
