import { redirect, type Handle } from '@sveltejs/kit';
import { startMqtt } from '$lib/server/mqtt';
import { startScheduler } from '$lib/server/scheduler';
import { isAuthed } from '$lib/server/auth';

startMqtt();
startScheduler();

export const handle: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;
	const open = path === '/login' || path.startsWith('/manifest') || path === '/service-worker.js';
	if (!open && !isAuthed(event.cookies.get('session'))) redirect(303, '/login');
	return resolve(event);
};
