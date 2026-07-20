<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import BellRing from '@lucide/svelte/icons/bell-ring';

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
	<title>Plant Monitor</title>
</svelte:head>

<main class="mx-auto max-w-2xl p-4 pb-16">
	{#if pushState === 'off'}
		<Button variant="secondary" class="mb-4 w-full" onclick={enablePush}>
			<BellRing class="size-4" />
			Enable watering alerts on this device
		</Button>
	{/if}
	{@render children()}
</main>
