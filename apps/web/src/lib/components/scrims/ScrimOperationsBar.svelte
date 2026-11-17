<script lang="ts">
    import { goto } from '$app/navigation';
    import { page } from '$app/state';
    import MenuButton from '#lib/components/layout/MenuButton.svelte';
    import type { MenuAction } from '#lib/components/common/menu.ts';
    import type {
        ScrimRevertAction,
        ScrimSettings,
        ScrimSettingsField
    } from '#lib/features/scrims/types.ts';
    import { postAction } from '#lib/ui/actions.ts';
    import { confirm } from '#lib/ui/confirm.ts';
    import { toast } from '#lib/ui/toast.ts';
    import ScrimSettingsDialog from './ScrimSettingsDialog.svelte';

    type Props = {
        revert: ScrimRevertAction | null;
        restore?: ScrimRevertAction | null;
        endEarly: boolean;
        cancellable: boolean;
        cancelGameCount?: number | null;
        settings: ScrimSettings;
        editable: ScrimSettingsField[];
        notifyParticipants?: boolean;
    };

    let {
        revert,
        restore = null,
        endEarly,
        cancellable,
        cancelGameCount = null,
        settings,
        editable,
        notifyParticipants = false
    }: Props = $props();

    type Key = 'settings' | 'revert' | 'restore' | 'endEarly' | 'cancel' | 'notifyParticipants';
    let editing = $state(false);
    let working = $state(false);
    let notifying = $state(false);
    const busy = $derived(working || notifying);

    const menu = $derived.by(() => {
        const items: { key: Key; action: MenuAction }[] = [];
        if (editable.length) items.push({ key: 'settings', action: { content: '내전 설정 수정' } });
        if (notifyParticipants)
            items.push({
                key: 'notifyParticipants',
                action: { content: '참가 안내 보내기', disabled: notifying }
            });
        if (revert)
            items.push({
                key: 'revert',
                action: {
                    content: revert.label,
                    desc: revert.blockedReason ?? undefined,
                    disabled: Boolean(revert.blockedReason)
                }
            });
        if (restore)
            items.push({
                key: 'restore',
                action: {
                    content: restore.label,
                    desc: restore.blockedReason ?? undefined,
                    disabled: Boolean(restore.blockedReason)
                }
            });
        if (endEarly) items.push({ key: 'endEarly', action: { content: '중도 종료', danger: true } });
        if (cancellable) items.push({ key: 'cancel', action: { content: '내전 취소', danger: true } });
        return items;
    });

    async function run(name: string, message: string, title: string) {
        if (busy) return;
        if (!(await confirm(message, title))) return;
        working = true;
        try {
            const failure = await postAction(name, {});
            if (failure) toast.error(failure);
        } finally {
            working = false;
        }
    }

    async function select(index: number) {
        if (busy) return;
        const key = menu[index]?.key;
        if (key === 'settings') editing = true;
        else if (key === 'notifyParticipants') {
            if (
                !(await confirm(
                    '선발된 참가자에게 Discord DM으로 참가 안내를 보낼까요? 이미 안내한 사람에게는 다시 보내지 않아요.',
                    '참가 안내 보내기'
                ))
            )
                return;
            notifying = true;
            try {
                const failure = await postAction('notifyParticipants', {});
                if (failure) toast.error(failure);
            } finally {
                notifying = false;
            }
        } else if (key === 'revert' && revert) await run('revert', revert.message, revert.label);
        else if (key === 'restore' && restore) await run('restore', restore.message, restore.label);
        else if (key === 'endEarly')
            await run(
                'endEarly',
                '남은 경기를 치르지 않고 내전을 끝낼까요? 기록된 게임과 점수는 남고, 진행 중 경기의 현재 점수 우세 팀을 결과로 표시해요. 동점이면 승자를 정하지 않아요.',
                '중도 종료'
            );
        else if (key === 'cancel')
            await run(
                'cancel',
                cancelGameCount !== null
                    ? `${cancelGameCount > 0 ? `기록된 세트 결과 ${cancelGameCount}개와 해당 MMR 반영을 모두 취소할까요?` : '진행 중인 경기를 모두 취소할까요?'} 참가자·경기·출전 기록은 이력으로 남아요. 복구하면 편성 준비로 돌아가며 취소한 결과·MMR은 재개하지 않아요.`
                    : '이 내전을 취소할까요? 참가자와 편성은 보존하며 취소 전 단계로 복구할 수 있어요.',
                '내전 취소'
            );
    }
</script>

{#if menu.length}
    <MenuButton
        label="운영 메뉴"
        actions={menu.map((item) => item.action)}
        align="right"
        onselect={select}
        triggerVariant="secondary"
        triggerClass="gap-1"
    >
        <span class="text-sm font-semibold">운영 메뉴</span>
        <span aria-hidden="true">▾</span>
    </MenuButton>
{/if}

{#if editable.length}
    <ScrimSettingsDialog
        bind:open={editing}
        title="내전 설정 수정"
        submitText="저장"
        action="settings"
        initial={settings}
        {editable}
        onsaved={async () => {
            const { invalidateAll } = await import('$app/navigation');
            await invalidateAll();
        }}
    />
{/if}
