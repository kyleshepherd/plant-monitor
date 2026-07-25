<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Button } from '$lib/components/ui/button';
	import * as Select from '$lib/components/ui/select';

	let { data, form } = $props();
	let category = $state('general');

	let species = $state('');
	let results = $state<{ pid: string; display: string }[]>([]);
	let timer: ReturnType<typeof setTimeout>;

	function search() {
		clearTimeout(timer);
		timer = setTimeout(async () => {
			results =
				species.length >= 2
					? await (await fetch(`/api/species?q=${encodeURIComponent(species)}`)).json()
					: [];
		}, 300);
	}
</script>

<a href="/" class="text-sm text-muted-foreground hover:underline">← back</a>

<Card.Root class="mt-3">
	<Card.Header>
		<Card.Title>Add a plant without a sensor</Card.Title>
		<Card.Description>
			Tracked by eye with a soil indicator — you'll get a care reminder card, not live readings.
		</Card.Description>
	</Card.Header>
	<Card.Content>
		<form method="POST" class="flex flex-col gap-4">
			<div class="flex flex-col gap-1.5">
				<Label for="name">Plant name</Label>
				<Input id="name" name="name" placeholder="e.g. Balcony olive" required />
			</div>
			<div class="flex flex-col gap-1.5">
				<Label for="species">Species <span class="text-muted-foreground">(optional)</span></Label>
				<Input
					id="species"
					name="species"
					bind:value={species}
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
									species = r.pid;
									results = [];
								}}>{r.display}</button
							>
						{/each}
					</div>
				{/if}
			</div>
			<div class="flex flex-col gap-1.5">
				<Label>Type <span class="text-muted-foreground">(sets the watering rule)</span></Label>
				<Select.Root type="single" name="category" bind:value={category}>
					<Select.Trigger class="w-full capitalize">{category}</Select.Trigger>
					<Select.Content>
						{#each data.categories as c (c)}
							<Select.Item value={c} class="capitalize">{c}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			</div>
			<div class="flex flex-col gap-1.5">
				<Label for="sunlightNotes">Sunlight / location notes</Label>
				<Input id="sunlightNotes" name="sunlightNotes" placeholder="e.g. covered balcony, part sun" />
			</div>
			{#if form?.message}<p class="text-sm text-destructive">{form.message}</p>{/if}
			<Button type="submit">Add plant</Button>
		</form>
	</Card.Content>
</Card.Root>
