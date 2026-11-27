<script lang="ts">
    import { onDestroy } from 'svelte';
    import { beforeNavigate } from '$app/navigation';
    import Dialog from '#lib/components/common/Dialog.svelte';
    import Button from '#lib/components/common/Button.svelte';
    import { confirmation, settleConfirmation } from '#lib/ui/confirm.ts';

    const cancel = () => settleConfirmation(false);
    // 루트가 유지되는 내부 이동에서도 이전 화면의 확인 요청을 남기지 않는다.
    beforeNavigate(cancel);
    onDestroy(cancel);

    const open = $derived($confirmation !== null);
    // 요청이 끝나도 dialog를 바로 지우지 않고 닫는다. 열린 dialog를 DOM에서 지우면 네이티브 포커스 복귀가 일어나지 않는다.
    let shown = $state<{ title: string; content: string } | null>(null);
    $effect(() => {
        if ($confirmation) shown = $confirmation;
    });
</script>

{#if shown}
    <Dialog title={shown.title} {open} dismissible={false} oncancel={cancel} onclose={cancel}>
        <p id="confirmation-content" class="text-sm leading-relaxed text-ink-2">{shown.content}</p>
        {#snippet footer()}
            <div class="flex flex-wrap justify-end gap-2">
                <Button variant="secondary" onclick={cancel}>취소</Button>
                <Button variant="primary" onclick={() => settleConfirmation(true)}>확인</Button>
            </div>
        {/snippet}
    </Dialog>
{/if}
