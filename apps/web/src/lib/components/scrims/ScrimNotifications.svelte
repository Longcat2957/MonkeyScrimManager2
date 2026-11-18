<script lang="ts">
    let {
        notifications
    }: { notifications: { pending: number; sent: number; blocked: number; uncertain: number } | null } =
        $props();

    const parts = $derived(
        notifications
            ? [
                  notifications.pending ? `전송 대기 ${notifications.pending}명` : '',
                  notifications.sent ? `완료 ${notifications.sent}명` : '',
                  notifications.blocked ? `실패 ${notifications.blocked}명` : '',
                  notifications.uncertain ? `전달 확인 필요 ${notifications.uncertain}명` : ''
              ].filter(Boolean)
            : []
    );
</script>

{#if parts.length}
    <p role="status" class="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-muted">
        <span class="font-semibold">참가 안내</span>
        <span>{parts.join(' · ')}</span>
        {#if notifications?.blocked || notifications?.uncertain}
            <span>Discord의 /게시복구에서 확인하세요</span>
        {/if}
    </p>
{/if}
