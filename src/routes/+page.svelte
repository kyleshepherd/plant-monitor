<script lang="ts">
	let { data } = $props();
</script>

<h1 class="text-xl font-semibold">Plants</h1>
{#each data.plants as { plant, latest } (plant.id)}
	<p><a href="/plants/{plant.id}">{plant.name}</a> — moisture {latest?.moisture ?? '–'}%</p>
{/each}
<h2 class="mt-6 font-semibold">Unclaimed sensors</h2>
{#each data.unclaimed as s (s.id)}
	<p><a class="underline" href="/claim/{s.id}">{s.mac}</a> (last seen {s.lastSeenAt})</p>
{/each}
