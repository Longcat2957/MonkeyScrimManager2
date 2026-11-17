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
</script>

{#if $confirmation}
    <Dialog title={$confirmation.title} {open} dismissible={false} onclose={cancel}>
        <p id="confirmation-content" class="leading-7">{$confirmation.content}</p>
        {#snippet footer()}
            <div class="flex justify-end gap-2">
                <Button variant="secondary" onclick={cancel}>취소</Button>
                <Button variant="primary" onclick={() => settleConfirmation(true)}>확인</Button>
            </div>
        {/snippet}
    </Dialog>
{/if}
