<script lang="ts">
    import { onDestroy } from 'svelte';
    import { beforeNavigate } from '$app/navigation';
    import { Dialog } from 'stdf';
    import { confirmation, settleConfirmation } from '#lib/ui/confirm.ts';
    import { overlay } from '#lib/ui/overlay.ts';

    const cancel = () => settleConfirmation(false);
    // 루트가 유지되는 내부 이동에서도 이전 화면의 확인 요청을 남기지 않는다.
    beforeNavigate(cancel);
    onDestroy(cancel);
</script>

{#if $confirmation}
    <div
        class="confirmation-host"
        aria-describedby="confirmation-content"
        {@attach overlay({ open: true, label: $confirmation.title, onclose: cancel })}
    >
        <Dialog
            visible
            title={$confirmation.title}
            secondaryClose={false}
            popup={{
                position: 'center',
                maskClosable: false,
                outDuration: 0,
                zIndex: 1600,
                mask: { zIndex: 1500 }
            }}
            onprimary={() => settleConfirmation(true)}
            onsecondary={cancel}
            onclose={cancel}
        >
            {#snippet contentChild()}
                <p id="confirmation-content" class="text-left leading-7">{$confirmation.content}</p>
            {/snippet}
        </Dialog>
    </div>
{/if}

<style>
    /* STDF 3 중앙 팝업에는 최대 폭 옵션이 없어 이 호스트의 실제 패널만 제한한다. */
    .confirmation-host > :global(div) > :global(div) > :global(div) {
        max-inline-size: 36rem;
        max-block-size: 85dvh;
        margin-inline: auto;
    }
</style>
