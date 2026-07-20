<script lang="ts">
	import Sparkline from '$lib/Sparkline.svelte';
	let { data } = $props();
</script>

<a href="/" class="text-sm text-gray-500">← back</a>
<h1 class="mb-1 text-xl font-semibold">{data.plant.name}</h1>
<p class="text-sm text-gray-500">
	{data.plant.species ?? 'no species set'} · sensor {data.sensor.mac} · thresholds via {data.plant
		.thresholdSource}
</p>
{#if data.plant.sunlightNotes}<p class="text-sm">☀️ {data.plant.sunlightNotes}</p>{/if}

<h2 class="mt-6 mb-1 font-semibold">Last 7 days</h2>
<Sparkline points={data.history} min={data.plant.moistureMin} />

<h2 class="mt-6 mb-1 font-semibold">Thresholds</h2>
<form method="POST" action="?/thresholds" class="flex items-end gap-2">
	<label class="text-sm"
		>min %<input
			name="moistureMin"
			type="number"
			value={data.plant.moistureMin}
			class="block w-20 rounded border p-1"
		/></label
	>
	<label class="text-sm"
		>max %<input
			name="moistureMax"
			type="number"
			value={data.plant.moistureMax}
			class="block w-20 rounded border p-1"
		/></label
	>
	<button class="rounded bg-green-700 px-3 py-1 text-white">Save</button>
</form>

<h2 class="mt-6 mb-1 font-semibold">Alerts</h2>
{#each data.alertLog as a (a.id)}
	<p class="text-sm">
		{a.type.replaceAll('_', ' ')} — opened {new Date(a.createdAt).toLocaleString()}
		{a.resolvedAt ? `· resolved ${new Date(a.resolvedAt).toLocaleString()}` : '· open'}
	</p>
{:else}
	<p class="text-sm text-gray-500">None yet 🎉</p>
{/each}

<form method="POST" action="?/unclaim" class="mt-8">
	<button class="text-sm text-red-600 underline">Unclaim sensor (deletes plant)</button>
</form>
