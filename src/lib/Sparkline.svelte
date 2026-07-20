<script lang="ts">
	let {
		points,
		min,
		wide = false
	}: {
		points: { moisture: number | null; recordedAt: Date | string }[];
		min: number;
		wide?: boolean;
	} = $props();
	const W = $derived(wide ? 360 : 120);
	const H = $derived(wide ? 80 : 32);
	const vals = $derived(points.filter((p) => p.moisture != null) as { moisture: number }[]);
	const path = $derived(
		vals.length < 2
			? ''
			: vals
					.map(
						(p, i) =>
							`${((i / (vals.length - 1)) * W).toFixed(1)},${(H - (Math.min(p.moisture, 100) / 100) * H).toFixed(1)}`
					)
					.join(' ')
	);
	const minY = $derived(H - (min / 100) * H);
</script>

{#if path}
	<svg
		viewBox="0 0 {W} {H}"
		class={wide ? 'h-24 w-full' : 'h-8 w-[120px] shrink-0'}
		preserveAspectRatio="none"
		role="img"
		aria-label="moisture history"
	>
		<line
			x1="0"
			y1={minY}
			x2={W}
			y2={minY}
			stroke="currentColor"
			stroke-dasharray="2 2"
			class="text-destructive/40"
		/>
		<polyline
			points={path}
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linejoin="round"
			stroke-linecap="round"
			vector-effect="non-scaling-stroke"
			class="text-primary"
		/>
	</svg>
{:else}
	<p class="text-xs text-muted-foreground">no data yet</p>
{/if}
