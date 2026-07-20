import webpush from 'web-push';
import { eq } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { db, pushSubscriptions } from './db';

let configured = false;
function configure() {
	if (configured || !env.VAPID_PUBLIC_KEY) return configured;
	webpush.setVapidDetails('mailto:kyle@kittoffices.com', env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
	return (configured = true);
}

export async function sendPushToAll(title: string, body: string): Promise<void> {
	if (!configure()) return;
	const subs = await db.select().from(pushSubscriptions);
	for (const sub of subs) {
		try {
			await webpush.sendNotification(
				sub.subscription as webpush.PushSubscription,
				JSON.stringify({ title, body })
			);
		} catch (e) {
			const status = (e as { statusCode?: number }).statusCode;
			if (status === 404 || status === 410) {
				await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
			} else {
				console.error('[push] send failed', e);
			}
		}
	}
}
