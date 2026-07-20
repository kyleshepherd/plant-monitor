<script lang="ts">
	import Sparkline from '$lib/Sparkline.svelte';
	let { data } = $props();
	const ago = (d: Date | string | null) => {
		if (!d) return 'never';
		const mins = Math.round((Date.now() - new Date(d).getTime()) / 60000);
		return mins < 60
			? `${mins}m ago`
			: mins < 1440
				? `${Math.round(mins / 60)}h ago`
				: `${Math.round(mins / 1440)}d ago`;
	};
</script>

<h1 class="mb-4 text-xl font-semibold">🌱 Plants</h1>

<div class="flex flex-col gap-3">
	{#each data.plants as { plant, sensor, latest, history, openAlert } (plant.id)}
		<a
			href="/plants/{plant.id}"
			class="rounded-lg border p-3 {openAlert ? 'border-red-400 bg-red-50' : ''}"
		>
			<div class="flex items-center justify-between gap-3">
				<div>
					<p class="font-medium">{plant.name}</p>
					<p class="text-sm text-gray-500">
						💧 {latest?.moisture ?? '–'}% (min {plant.moistureMin}) · ☀️ {latest?.lux ?? '–'} lx
						{#if sensor.battery != null}· 🔋 {sensor.battery}%{/if}
						· seen {ago(sensor.lastSeenAt)}
					</p>
					{#if openAlert}
						<p class="text-sm font-medium text-red-700">⚠ {openAlert.type.replaceAll('_', ' ')}</p>
					{/if}
				</div>
				<Sparkline points={history} min={plant.moistureMin} />
			</div>
		</a>
	{/each}
	{#if data.plants.length === 0}
		<p class="text-gray-500">No plants yet — claim a sensor below.</p>
	{/if}
</div>

{#if data.unclaimed.length}
	<h2 class="mt-8 mb-2 font-semibold">Unclaimed sensors</h2>
	{#each data.unclaimed as s (s.id)}
		<a class="block text-sm underline" href="/claim/{s.id}">{s.mac} — seen {ago(s.lastSeenAt)}</a>
	{/each}
{/if}
