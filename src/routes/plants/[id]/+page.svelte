<script lang="ts">
	import Sparkline from '$lib/Sparkline.svelte';
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Progress } from '$lib/components/ui/progress';
	import { Separator } from '$lib/components/ui/separator';
	import * as Select from '$lib/components/ui/select';
	import Droplets from '@lucide/svelte/icons/droplets';
	import Sun from '@lucide/svelte/icons/sun';
	import Thermometer from '@lucide/svelte/icons/thermometer';
	import BatteryLow from '@lucide/svelte/icons/battery-low';
	import Clock from '@lucide/svelte/icons/clock';

	let { data, form } = $props();
	let editing = $state(false);
	let category = $state(data.plant.careCategory ?? 'general');

	const needsWater = $derived(
		!data.manual && data.latest?.moisture != null && data.latest.moisture < data.plant.moistureMin
	);
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
		low_moisture: 'needs water',
		low_battery: 'low battery',
		sensor_silent: 'sensor silent'
	};
</script>

<a href="/" class="text-sm text-muted-foreground hover:underline">← back</a>

<div class="mt-2 mb-4 flex items-start justify-between gap-3">
	<div class="min-w-0">
		<div class="flex flex-wrap items-center gap-2">
			<h1 class="text-2xl font-semibold tracking-tight">{data.plant.name}</h1>
			{#if data.manual}
				<Badge variant="secondary">manual</Badge>
			{:else if needsWater}
				<Badge variant="destructive"><Droplets class="size-3" /> Needs water</Badge>
			{/if}
		</div>
		<p class="mt-1 text-sm text-muted-foreground">
			{data.plant.species ?? 'no species set'}{#if !data.manual}
				· sensor <span class="font-mono">{data.sensor.mac}</span>{/if}
		</p>
		{#if data.plant.sunlightNotes}
			<p class="mt-1 text-sm text-muted-foreground">☀️ {data.plant.sunlightNotes}</p>
		{/if}
	</div>
	<Button variant="outline" size="sm" onclick={() => (editing = !editing)}>
		{editing ? 'Cancel' : 'Edit'}
	</Button>
</div>

{#if editing}
	<Card.Root class="mb-4">
		<Card.Header>
			<Card.Title class="text-base">Edit details</Card.Title>
		</Card.Header>
		<Card.Content>
			<form method="POST" action="?/details" class="flex flex-col gap-3">
				<div class="flex flex-col gap-1.5">
					<Label for="name">Name</Label>
					<Input id="name" name="name" value={data.plant.name} required />
				</div>
				<div class="flex flex-col gap-1.5">
					<Label for="species">Species</Label>
					<Input id="species" name="species" value={data.plant.species ?? ''} />
				</div>
				{#if data.manual}
					<div class="flex flex-col gap-1.5">
						<Label>Type (watering rule)</Label>
						<Select.Root type="single" name="category" bind:value={category}>
							<Select.Trigger class="w-full capitalize">{category}</Select.Trigger>
							<Select.Content>
								{#each data.categories as c (c)}
									<Select.Item value={c} class="capitalize">{c}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
					</div>
				{/if}
				<div class="flex flex-col gap-1.5">
					<Label for="sunlightNotes">Sunlight / location notes</Label>
					<Input id="sunlightNotes" name="sunlightNotes" value={data.plant.sunlightNotes ?? ''} />
				</div>
				{#if form?.message}<p class="text-sm text-destructive">{form.message}</p>{/if}
				<Button type="submit" class="self-start">Save</Button>
			</form>
		</Card.Content>
	</Card.Root>
{/if}

{#if data.manual}
	<Card.Root>
		<Card.Header>
			<Card.Title class="text-base">Watering</Card.Title>
			<Card.Description>Tracked by eye with a soil indicator</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-3">
			<p class="flex items-start gap-2 font-medium">
				<Droplets class="mt-0.5 size-4 shrink-0 text-primary" />{data.care.short}
			</p>
			<p class="text-sm text-muted-foreground">{data.care.detail}</p>
			<Separator />
			<div class="flex items-center justify-between">
				<span class="text-sm text-muted-foreground">Last watered {data.wateredAgo}</span>
				<form method="POST" action="?/watered">
					<Button type="submit" variant="secondary" size="sm">
						<Droplets class="size-4" /> Watered today
					</Button>
				</form>
			</div>
		</Card.Content>
	</Card.Root>

	<Separator class="my-6" />

	<form method="POST" action="?/delete">
		<Button type="submit" variant="ghost" class="text-destructive hover:text-destructive">
			Delete plant
		</Button>
	</form>
{:else}
	<Card.Root class={needsWater ? 'border-destructive/60 bg-destructive/5' : ''}>
		<Card.Header>
			<Card.Title class="text-base">Now</Card.Title>
			<Card.Description>updated {ago(data.sensor.lastSeenAt)}</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-3">
			<div class="flex items-center gap-2">
				<Droplets
					class="size-4 shrink-0 {needsWater ? 'text-destructive' : 'text-muted-foreground'}"
				/>
				<Progress value={data.latest?.moisture ?? 0} max={100} class="h-2 flex-1" />
				<span
					class="w-16 text-right text-sm font-medium tabular-nums {needsWater
						? 'text-destructive'
						: ''}">{data.latest?.moisture ?? '–'}%</span
				>
			</div>
			<div class="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
				<span class="inline-flex items-center gap-1.5">
					<Sun class="size-4" />{data.latest?.lux ?? '–'} lx
				</span>
				<span class="inline-flex items-center gap-1.5">
					<Thermometer class="size-4" />{data.latest?.tempC ?? '–'}°C
				</span>
				<span class="inline-flex items-center gap-1.5">
					<BatteryLow class="size-4" />{data.latest?.battery ?? data.sensor.battery ?? '–'}%
				</span>
				<span class="inline-flex items-center gap-1.5">
					<Clock class="size-4" />min {data.plant.moistureMin}%
				</span>
			</div>
		</Card.Content>
	</Card.Root>

	<Card.Root class="mt-4">
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
{/if}
