<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import BellRing from '@lucide/svelte/icons/bell-ring';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';

	let { children } = $props();
	let pushState = $state<'unsupported' | 'off' | 'on'>('unsupported');

	// Custom pull-to-refresh: installed PWAs lose the browser's native one.
	let pullY = $state(0);
	let refreshing = $state(false);
	let startY = 0;
	let pulling = false;
	const THRESHOLD = 70;

	function onTouchStart(e: TouchEvent) {
		if (window.scrollY <= 0 && !refreshing) {
			startY = e.touches[0].clientY;
			pulling = true;
		}
	}
	function onTouchMove(e: TouchEvent) {
		if (!pulling) return;
		const dy = e.touches[0].clientY - startY;
		pullY = dy > 0 ? Math.min(dy * 0.4, 100) : 0;
	}
	async function onTouchEnd() {
		if (!pulling) return;
		pulling = false;
		if (pullY >= THRESHOLD * 0.4) {
			refreshing = true;
			pullY = 24;
			await invalidateAll();
			refreshing = false;
		}
		pullY = 0;
	}

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

<div
	role="presentation"
	ontouchstart={onTouchStart}
	ontouchmove={onTouchMove}
	ontouchend={onTouchEnd}
	class="min-h-dvh"
>
	<div
		class="flex items-center justify-center overflow-hidden transition-[height] duration-150"
		style="height: {pullY}px"
	>
		<LoaderCircle
			class="size-5 text-muted-foreground {refreshing ? 'animate-spin' : ''}"
			style="transform: rotate({pullY * 3}deg)"
		/>
	</div>
	<main class="mx-auto max-w-2xl p-4 pb-16">
		{#if pushState === 'off'}
			<Button variant="secondary" class="mb-4 w-full" onclick={enablePush}>
				<BellRing class="size-4" />
				Enable watering alerts on this device
			</Button>
		{/if}
		{@render children()}
	</main>
</div>
