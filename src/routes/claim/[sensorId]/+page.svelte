<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Button } from '$lib/components/ui/button';
	import * as Select from '$lib/components/ui/select';

	let { data, form } = $props();
	let query = $state('');
	let results = $state<{ pid: string; display: string }[]>([]);
	let chosen = $state<{ pid: string; display: string } | null>(null);
	let preset = $state('general');
	let timer: ReturnType<typeof setTimeout>;

	function search() {
		chosen = null;
		clearTimeout(timer);
		timer = setTimeout(async () => {
			results =
				query.length >= 2
					? await (await fetch(`/api/species?q=${encodeURIComponent(query)}`)).json()
					: [];
		}, 300);
	}
</script>

<a href="/" class="text-sm text-muted-foreground hover:underline">← back</a>

<Card.Root class="mt-3">
	<Card.Header>
		<Card.Title>Claim sensor</Card.Title>
		<Card.Description>
			<span class="font-mono">{data.sensor.mac}</span> — tell us about the plant it lives with
		</Card.Description>
	</Card.Header>
	<Card.Content>
		<form method="POST" class="flex flex-col gap-4">
			<div class="flex flex-col gap-1.5">
				<Label for="name">Plant name</Label>
				<Input id="name" name="name" placeholder="e.g. Kitchen monstera" required />
			</div>

			<div class="flex flex-col gap-1.5">
				<Label for="sunlightNotes">Sunlight / location notes</Label>
				<Input id="sunlightNotes" name="sunlightNotes" placeholder="e.g. east window, morning sun" />
			</div>

			<div class="flex flex-col gap-1.5">
				<Label for="species-search">Species <span class="text-muted-foreground">(optional — sets thresholds automatically)</span></Label>
				<Input
					id="species-search"
					bind:value={query}
					oninput={search}
					placeholder="Search species…"
					autocomplete="off"
				/>
				{#if results.length}
					<div class="overflow-hidden rounded-md border">
						{#each results.slice(0, 6) as r (r.pid)}
							<button
								type="button"
								class="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
								onclick={() => {
									chosen = r;
									query = r.display;
									results = [];
								}}>{r.display}</button
							>
						{/each}
					</div>
				{/if}
				{#if chosen}<p class="text-xs text-muted-foreground">✓ thresholds will come from OpenPlantbook for {chosen.display}</p>{/if}
			</div>
			<input type="hidden" name="speciesPid" value={chosen?.pid ?? ''} />

			<div class="flex flex-col gap-1.5">
				<Label>Fallback preset</Label>
				<Select.Root type="single" name="preset" bind:value={preset}>
					<Select.Trigger class="w-full capitalize">{preset}</Select.Trigger>
					<Select.Content>
						{#each Object.keys(data.presets) as p (p)}
							<Select.Item value={p} class="capitalize">{p}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			</div>

			<details class="text-sm">
				<summary class="cursor-pointer text-muted-foreground">Manual thresholds (override)</summary>
				<div class="mt-2 flex gap-2">
					<Input name="moistureMin" type="number" min="0" max="100" placeholder="min %" class="w-24" />
					<Input name="moistureMax" type="number" min="0" max="100" placeholder="max %" class="w-24" />
				</div>
			</details>

			{#if form?.message}<p class="text-sm text-destructive">{form.message}</p>{/if}
			<Button type="submit">Create plant</Button>
		</form>
	</Card.Content>
</Card.Root>
