<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';

	let { children } = $props();
	let pushState = $state<'unsupported' | 'off' | 'on'>('unsupported');

	onMount(async () => {
		if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
		const reg = await navigator.serviceWorker.register('/service-worker.js');
		pushState = (await reg.pushManager.getSubscription()) ? 'on' : 'off';
	});

	async function enablePush() {
		const reg = await navigator.serviceWorker.ready;
		const { key } = await (await fetch('/api/push')).json();
		const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
		await fetch('/api/push', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(sub)
		});
		pushState = 'on';
	}
</script>

<svelte:head>
	<link rel="icon" href="/favicon.png" />
</svelte:head>

<main class="mx-auto max-w-2xl p-4">
	{#if pushState === 'off'}
		<button onclick={enablePush} class="mb-4 w-full rounded bg-green-100 p-2 text-sm text-green-900">
			🔔 Enable watering alerts on this device
		</button>
	{/if}
	{@render children()}
</main>
