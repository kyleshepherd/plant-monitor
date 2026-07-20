<script lang="ts">
	let { data, form } = $props();
	let query = $state('');
	let results = $state<{ pid: string; display: string }[]>([]);
	let chosen = $state<{ pid: string; display: string } | null>(null);
	let timer: ReturnType<typeof setTimeout>;

	function search() {
		clearTimeout(timer);
		timer = setTimeout(async () => {
			results =
				query.length >= 2
					? await (await fetch(`/api/species?q=${encodeURIComponent(query)}`)).json()
					: [];
		}, 300);
	}
</script>

<h1 class="text-xl font-semibold">Claim sensor {data.sensor.mac}</h1>
<form method="POST" class="mt-4 flex flex-col gap-3">
	<input
		name="name"
		placeholder="Plant name (e.g. Kitchen monstera)"
		required
		class="rounded border p-2"
	/>
	<input name="sunlightNotes" placeholder="Sunlight / location notes" class="rounded border p-2" />

	<label class="text-sm font-medium" for="species-search"
		>Species (optional — sets thresholds automatically)</label
	>
	<input
		id="species-search"
		bind:value={query}
		oninput={search}
		placeholder="Search species…"
		class="rounded border p-2"
	/>
	{#each results as r (r.pid)}
		<button
			type="button"
			class="text-left text-sm underline"
			onclick={() => {
				chosen = r;
				query = r.display;
				results = [];
			}}>{r.display}</button
		>
	{/each}
	<input type="hidden" name="speciesPid" value={chosen?.pid ?? ''} />

	<label class="text-sm font-medium" for="preset-select">Fallback preset</label>
	<select id="preset-select" name="preset" class="rounded border p-2">
		{#each Object.keys(data.presets) as p (p)}<option value={p}>{p}</option>{/each}
	</select>

	<details>
		<summary class="text-sm">Manual thresholds (override)</summary>
		<div class="mt-2 flex gap-2">
			<input
				name="moistureMin"
				type="number"
				min="0"
				max="100"
				placeholder="min %"
				class="w-24 rounded border p-2"
			/>
			<input
				name="moistureMax"
				type="number"
				min="0"
				max="100"
				placeholder="max %"
				class="w-24 rounded border p-2"
			/>
		</div>
	</details>

	{#if form?.message}<p class="text-sm text-red-600">{form.message}</p>{/if}
	<button class="rounded bg-green-700 p-2 text-white">Create plant</button>
</form>
