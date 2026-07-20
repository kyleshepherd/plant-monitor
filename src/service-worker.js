self.addEventListener('push', (event) => {
	const { title, body } = event.data?.json() ?? { title: 'Plant Monitor', body: '' };
	event.waitUntil(self.registration.showNotification(title, { body, icon: '/favicon.png' }));
});

self.addEventListener('notificationclick', (event) => {
	event.notification.close();
	event.waitUntil(self.clients.openWindow('/'));
});
