<script lang="ts">
	let { form } = $props();
</script>

<form method="POST" class="mx-auto mt-24 flex max-w-xs flex-col gap-3">
	<h1 class="text-xl font-semibold">🌱 Plant Monitor</h1>
	<input name="password" type="password" placeholder="Password" required class="rounded border p-2" />
	{#if form?.wrong}<p class="text-sm text-red-600">Wrong password</p>{/if}
	<button class="rounded bg-green-700 p-2 text-white">Log in</button>
</form>
