<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { enhance } from '$app/forms';
	import Sparkline from '$lib/Sparkline.svelte';
	import * as Card from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Progress } from '$lib/components/ui/progress';
	import Droplets from '@lucide/svelte/icons/droplets';
	import Sun from '@lucide/svelte/icons/sun';
	import BatteryLow from '@lucide/svelte/icons/battery-low';
	import RadioTower from '@lucide/svelte/icons/radio-tower';
	import Clock from '@lucide/svelte/icons/clock';
	import Plus from '@lucide/svelte/icons/plus';

	let { data } = $props();

	// Installed PWAs have no pull-to-refresh; refetch the dashboard periodically.
	onMount(() => {
		const t = setInterval(invalidateAll, 30_000);
		return () => clearInterval(t);
	});

	const ago = (d: Date | string | null) => {
		if (!d) return 'never';
		const mins = Math.round((Date.now() - new Date(d).getTime()) / 60000);
		return mins < 60
			? `${mins}m ago`
			: mins < 1440
				? `${Math.round(mins / 60)}h ago`
				: `${Math.round(mins / 1440)}d ago`;
	};
	const alertLabel: Record<string, string> = {
		low_moisture: 'Needs water',
		low_battery: 'Low battery',
		sensor_silent: 'Sensor silent'
	};
</script>

<div class="mb-6 flex items-center justify-between gap-2">
	<div class="flex items-center gap-2">
		<span class="text-2xl">🌱</span>
		<h1 class="text-2xl font-semibold tracking-tight">Plants</h1>
	</div>
	<Button href="/add" variant="outline" size="sm">
		<Plus class="size-4" /> Add plant
	</Button>
</div>

<div class="flex flex-col gap-4">
	{#each data.plants as entry (entry.plant.id)}
		{@const plant = entry.plant}
		{#if entry.manual}
			<Card.Root>
				<Card.Content class="flex items-start gap-3">
					{#if plant.imageUrl}
						<img
							src={plant.imageUrl}
							alt={plant.name}
							class="size-14 shrink-0 rounded-lg object-cover"
							onerror={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
						/>
					{/if}
					<div class="min-w-0 flex-1">
						<div class="flex flex-wrap items-center gap-2">
							<a href="/plants/{plant.id}" class="truncate font-medium hover:underline"
								>{plant.name}</a
							>
							<Badge variant="secondary" class="shrink-0">manual</Badge>
						</div>
						<p class="mt-2 flex items-start gap-1.5 text-sm text-muted-foreground">
							<Droplets class="mt-0.5 size-4 shrink-0" />{entry.care.short}
						</p>
						<p class="mt-1 text-xs text-muted-foreground">Last watered {entry.wateredAgo}</p>
					</div>
					<form method="POST" action="?/watered" use:enhance>
						<input type="hidden" name="plantId" value={plant.id} />
						<Button type="submit" variant="secondary" size="sm">
							<Droplets class="size-4" /> Watered
						</Button>
					</form>
				</Card.Content>
			</Card.Root>
		{:else}
			{@const sensor = entry.sensor}
			{@const latest = entry.latest}
			{@const history = entry.history}
			{@const openAlert = entry.openAlert}
			{@const needsWater = latest?.moisture != null && latest.moisture < plant.moistureMin}
		{@const otherAlert = openAlert && openAlert.type !== 'low_moisture' ? openAlert : null}
		<a href="/plants/{plant.id}" class="group">
			<Card.Root
				class="transition-shadow group-hover:shadow-md {needsWater || otherAlert
					? 'border-destructive/60 bg-destructive/5'
					: ''}"
			>
				<Card.Content class="flex items-center gap-3">
					{#if plant.imageUrl}
						<img
							src={plant.imageUrl}
							alt={plant.name}
							class="size-14 shrink-0 rounded-lg object-cover"
							onerror={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
						/>
					{/if}
					<div class="min-w-0 flex-1">
						<div class="flex flex-wrap items-center gap-2">
							<p class="truncate font-medium">{plant.name}</p>
							{#if needsWater}
								<Badge variant="destructive" class="shrink-0">
									<Droplets class="size-3" />
									Needs water
								</Badge>
							{/if}
							{#if otherAlert}
								<Badge variant="destructive" class="shrink-0">
									{#if otherAlert.type === 'low_battery'}<BatteryLow class="size-3" />
									{:else}<RadioTower class="size-3" />{/if}
									{alertLabel[otherAlert.type] ?? otherAlert.type}
								</Badge>
							{/if}
						</div>
						<div class="mt-2 flex items-center gap-2">
							<Droplets
								class="size-4 shrink-0 {needsWater ? 'text-destructive' : 'text-muted-foreground'}"
							/>
							<Progress value={latest?.moisture ?? 0} max={100} class="h-2 flex-1" />
							<span
								class="w-12 text-right text-sm font-medium tabular-nums {needsWater
									? 'text-destructive'
									: 'text-muted-foreground'}">{latest?.moisture ?? '–'}%</span
							>
						</div>
						<p class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
							<span>min {plant.moistureMin}%</span>
							<span class="inline-flex items-center gap-1"
								><Sun class="size-3" />{latest?.lux ?? '–'} lx</span
							>
							<span class="inline-flex items-center gap-1"
								><BatteryLow class="size-3" />{latest?.battery ?? sensor.battery ?? '–'}%</span
							>
							<span class="inline-flex items-center gap-1"
								><Clock class="size-3" />{ago(sensor.lastSeenAt)}</span
							>
						</p>
					</div>
					<Sparkline points={history} min={plant.moistureMin} />
				</Card.Content>
			</Card.Root>
		</a>
		{/if}
	{/each}
	{#if data.plants.length === 0}
		<Card.Root>
			<Card.Content class="py-10 text-center text-muted-foreground">
				No plants yet — claim a sensor below 🌿
			</Card.Content>
		</Card.Root>
	{/if}
</div>

{#if data.unclaimed.length}
	<h2 class="mt-10 mb-3 text-sm font-medium tracking-wide text-muted-foreground uppercase">
		Unclaimed sensors
	</h2>
	<div class="flex flex-col gap-2">
		{#each data.unclaimed as s (s.id)}
			<a href="/claim/{s.id}" class="group">
				<Card.Root class="transition-shadow group-hover:shadow-md">
					<Card.Content class="flex items-center justify-between py-3">
						<span class="font-mono text-sm">{s.mac}</span>
						<span class="text-xs text-muted-foreground">seen {ago(s.lastSeenAt)} · claim →</span>
					</Card.Content>
				</Card.Root>
			</a>
		{/each}
	</div>
{/if}
