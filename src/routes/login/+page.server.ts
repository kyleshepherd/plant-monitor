import { fail, redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { sessionToken } from '$lib/server/auth';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const form = await request.formData();
		if (form.get('password') !== env.APP_PASSWORD) return fail(401, { wrong: true });
		cookies.set('session', sessionToken(), {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: true,
			maxAge: 60 * 60 * 24 * 365
		});
		redirect(303, '/');
	}
};
