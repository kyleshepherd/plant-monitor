import { redirect, type Handle } from '@sveltejs/kit';
import { startMqtt } from '$lib/server/mqtt';
import { seedSnapshots } from '$lib/server/ingest';
import { startScheduler } from '$lib/server/scheduler';
import { isAuthed } from '$lib/server/auth';

startMqtt();
seedSnapshots().catch((e) => console.error('[ingest] snapshot seed failed', e));
startScheduler();

export const handle: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;
	const open = path === '/login' || path.startsWith('/manifest') || path === '/service-worker.js';
	if (!open && !isAuthed(event.cookies.get('session'))) redirect(303, '/login');
	return resolve(event);
};
