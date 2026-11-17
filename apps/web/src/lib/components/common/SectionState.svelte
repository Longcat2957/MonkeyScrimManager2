<script lang="ts">
    import Button from '#lib/components/common/Button.svelte';
    import Skeleton from '#lib/components/common/Skeleton.svelte';

    type Props =
        | { state: 'loading'; lines?: number }
        | { state: 'empty'; message: string }
        | { state: 'error'; message: string; onretry: () => void | Promise<void> };

    let props: Props = $props();
    let retrying = $state(false);
    let retryError = $state('');

    async function retry() {
        if (props.state !== 'error' || retrying) return;
        retrying = true;
        retryError = '';
        try {
            await props.onretry();
        } catch {
            retryError = '다시 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요.';
        } finally {
            retrying = false;
        }
    }
</script>

{#if props.state === 'loading'}
    <div aria-busy="true">
        <span class="sr-only">불러오는 중</span>
        <Skeleton rows={props.lines ?? 3} />
    </div>
{:else if props.state === 'empty'}
    <p
        class="rounded-(--radius-box) border border-dashed border-brass-line px-4 py-8 text-center text-sm text-text-muted"
    >
        {props.message}
    </p>
{:else}
    <div
        role="alert"
        class="flex flex-col items-center gap-3 rounded-(--radius-box) border border-dashed border-brass-line px-4 py-6 text-center"
    >
        <p class="text-sm text-error">{retryError || props.message}</p>
        <Button variant="secondary" size="sm" loading={retrying} onclick={retry}>다시 시도</Button>
    </div>
{/if}
