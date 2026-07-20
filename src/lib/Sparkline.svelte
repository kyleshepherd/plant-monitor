<script lang="ts">
	let {
		points,
		min
	}: { points: { moisture: number | null; recordedAt: Date | string }[]; min: number } = $props();
	const W = 120;
	const H = 32;
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
	<svg viewBox="0 0 {W} {H}" class="h-8 w-[120px] shrink-0" role="img" aria-label="moisture history">
		<line
			x1="0"
			y1={minY}
			x2={W}
			y2={minY}
			stroke="currentColor"
			stroke-dasharray="2 2"
			class="text-red-300"
		/>
		<polyline
			points={path}
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linejoin="round"
			stroke-linecap="round"
			class="text-green-700"
		/>
	</svg>
{/if}
