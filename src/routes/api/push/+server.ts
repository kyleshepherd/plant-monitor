import { json } from '@sveltejs/kit';
import { db, pushSubscriptions } from '$lib/server/db';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => json({ key: env.VAPID_PUBLIC_KEY ?? '' });

export const POST: RequestHandler = async ({ request }) => {
	await db.insert(pushSubscriptions).values({ subscription: await request.json() });
	return json({ ok: true });
};
