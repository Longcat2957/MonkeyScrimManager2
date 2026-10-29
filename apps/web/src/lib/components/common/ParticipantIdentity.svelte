<script lang="ts">
	interface Props {
		displayName: string;
		username?: string;
		avatarUrl?: string | null;
	}

	let { displayName, username, avatarUrl = null }: Props = $props();
	let imageFailed = $state(false);
</script>

<div class="flex items-center gap-4">
	<div class="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-bg-overlay text-lg font-semibold dark:bg-bg-overlay-dark" aria-hidden="true">
		{#if avatarUrl && !imageFailed}
			<img src={avatarUrl} alt="" width="48" height="48" class="size-full object-cover" onerror={() => (imageFailed = true)} />
		{:else}
			{displayName.slice(0, 1)}
		{/if}
	</div>
	<div class="min-w-0">
		<p class="break-words font-semibold">{displayName}</p>
		{#if username}<p class="mt-1 break-words text-sm opacity-60">@{username}</p>{/if}
	</div>
</div>
