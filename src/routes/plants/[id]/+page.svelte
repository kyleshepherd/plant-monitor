<script lang="ts">
	import Sparkline from '$lib/Sparkline.svelte';
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Separator } from '$lib/components/ui/separator';

	let { data } = $props();
	const alertLabel: Record<string, string> = {
		low_moisture: 'needs water',
		low_battery: 'low battery',
		sensor_silent: 'sensor silent'
	};
</script>

<a href="/" class="text-sm text-muted-foreground hover:underline">← back</a>

<div class="mt-2 mb-4">
	<h1 class="text-2xl font-semibold tracking-tight">{data.plant.name}</h1>
	<p class="mt-1 text-sm text-muted-foreground">
		{data.plant.species ?? 'no species set'} · sensor
		<span class="font-mono">{data.sensor.mac}</span>
		· thresholds via <Badge variant="secondary">{data.plant.thresholdSource}</Badge>
	</p>
	{#if data.plant.sunlightNotes}
		<p class="mt-1 text-sm text-muted-foreground">☀️ {data.plant.sunlightNotes}</p>
	{/if}
</div>

<Card.Root>
	<Card.Header>
		<Card.Title class="text-base">Last 7 days</Card.Title>
	</Card.Header>
	<Card.Content>
		<Sparkline points={data.history} min={data.plant.moistureMin} wide />
	</Card.Content>
</Card.Root>

<Card.Root class="mt-4">
	<Card.Header>
		<Card.Title class="text-base">Thresholds</Card.Title>
		<Card.Description>Alert when moisture drops below min</Card.Description>
	</Card.Header>
	<Card.Content>
		<form method="POST" action="?/thresholds" class="flex items-end gap-3">
			<div class="flex flex-col gap-1.5">
				<Label for="moistureMin">min %</Label>
				<Input
					id="moistureMin"
					name="moistureMin"
					type="number"
					value={data.plant.moistureMin}
					class="w-24"
				/>
			</div>
			<div class="flex flex-col gap-1.5">
				<Label for="moistureMax">max %</Label>
				<Input
					id="moistureMax"
					name="moistureMax"
					type="number"
					value={data.plant.moistureMax}
					class="w-24"
				/>
			</div>
			<Button type="submit">Save</Button>
		</form>
	</Card.Content>
</Card.Root>

<Card.Root class="mt-4">
	<Card.Header>
		<Card.Title class="text-base">Alert history</Card.Title>
	</Card.Header>
	<Card.Content class="flex flex-col gap-2">
		{#each data.alertLog as a (a.id)}
			<div class="flex items-center justify-between text-sm">
				<span class="flex items-center gap-2">
					{#if a.resolvedAt}
						<Badge variant="outline">{alertLabel[a.type] ?? a.type}</Badge>
					{:else}
						<Badge variant="destructive">{alertLabel[a.type] ?? a.type}</Badge>
					{/if}
				</span>
				<span class="text-xs text-muted-foreground">
					{new Date(a.createdAt).toLocaleString()}
					{a.resolvedAt ? ` → resolved ${new Date(a.resolvedAt).toLocaleString()}` : ' · open'}
				</span>
			</div>
		{:else}
			<p class="text-sm text-muted-foreground">None yet 🎉</p>
		{/each}
	</Card.Content>
</Card.Root>

<Separator class="my-6" />

<form method="POST" action="?/unclaim">
	<Button type="submit" variant="ghost" class="text-destructive hover:text-destructive">
		Unclaim sensor (deletes plant)
	</Button>
</form>
