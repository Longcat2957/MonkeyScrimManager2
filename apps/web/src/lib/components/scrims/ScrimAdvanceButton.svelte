<script lang="ts">
    import { goto } from '$app/navigation';
    import { page } from '$app/state';
    import Button from '#lib/components/common/Button.svelte';
    import { formationPath } from '#lib/features/scrims/paths.ts';
    import type { ScrimNextAction } from '#lib/features/scrims/types.ts';
    import { postAction } from '#lib/ui/actions.ts';
    import { confirm } from '#lib/ui/confirm.ts';
    import { toast } from '#lib/ui/toast.ts';

    let { nextAction }: { nextAction: ScrimNextAction | null } = $props();

    // 대진의 확정·시작은 대진 작업판에서 한 번만 제공한다.
    const phaseAction = $derived(
        nextAction?.key === 'start' || nextAction?.key === 'ready' ? null : nextAction
    );

    const CONFIRM: Record<ScrimNextAction['key'], string> = {
        close: '모집을 마감할까요?',
        ready: '대진 준비로 넘어갈까요?',
        start: '내전을 시작할까요?',
        complete: '내전을 종료할까요?'
    };

    let advancing = $state(false);

    async function advance() {
        if (!phaseAction || advancing) return;
        const key = phaseAction.key;
        if (!(await confirm(CONFIRM[key], phaseAction.label))) return;
        advancing = true;
        try {
            const message = await postAction('advance', { key });
            if (message) toast.error(message);
            else if (key === 'close' && page.data.scrim?.formationMethod) {
                const target = formationPath(
                    { guildId: page.params.guildId!, scrimId: page.params.scrimId! },
                    page.data.scrim.formationMethod
                );
                if (target) await goto(target);
            }
        } finally {
            advancing = false;
        }
    }
</script>

{#if phaseAction}
    <div class="flex flex-col items-end gap-1">
        <Button
            variant="primary"
            size="sm"
            injClass="min-h-9 px-4"
            disabled={advancing || Boolean(phaseAction.blockedReason)}
            loading={advancing}
            onclick={advance}
        >
            <span>{phaseAction.label}</span>
            <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.4"
                aria-hidden="true"
            >
                <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
        </Button>
        {#if phaseAction.blockedReason}
            <span class="max-w-52 text-right text-xs text-text-muted">{phaseAction.blockedReason}</span>
        {/if}
    </div>
{/if}
