<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';

	let { form } = $props();
</script>

<div class="flex min-h-[70dvh] items-center justify-center">
	<Card.Root class="w-full max-w-sm">
		<Card.Header class="text-center">
			<div class="mb-1 text-4xl">🌱</div>
			<Card.Title class="text-xl">Plant Monitor</Card.Title>
			<Card.Description>Enter the password to tend the garden</Card.Description>
		</Card.Header>
		<Card.Content>
			<form method="POST" class="flex flex-col gap-3">
				<Input name="password" type="password" placeholder="Password" required />
				{#if form?.wrong}<p class="text-sm text-destructive">Wrong password</p>{/if}
				<Button type="submit" class="w-full">Log in</Button>
			</form>
		</Card.Content>
	</Card.Root>
</div>
