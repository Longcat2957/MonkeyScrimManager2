<script lang="ts">
    import Button from '#lib/components/common/Button.svelte';
    import StatusTag from '#lib/components/common/StatusTag.svelte';
    import type { LolPosition } from '#lib/features/guild/types.ts';
    import { MY_REGISTRATION, POSITIONS, REGISTRATION_STATUS } from '#lib/features/labels.ts';
    import type { MyRegistration, RegistrationAccount } from '#lib/features/scrims/types.ts';
    import { postAction } from '#lib/ui/actions.ts';
    import { confirm } from '#lib/ui/confirm.ts';
    import { toast } from '#lib/ui/toast.ts';
    import PositionChips from './PositionChips.svelte';
    import RegistrationDialog from './RegistrationDialog.svelte';

    type Props = {
        registration: MyRegistration | null;
        accounts: RegistrationAccount[];
        primaryAccountId: string | null;
        previousPositions: LolPosition[];
        canRegister: boolean;
        canEdit: boolean;
        blockedReason: string | null;
        actions?: {
            register: (accountId: string, positions: LolPosition[]) => void;
            update: (accountId: string, positions: LolPosition[]) => void;
            withdraw: () => void;
        };
    };

    let {
        registration,
        accounts,
        primaryAccountId,
        previousPositions,
        canRegister,
        canEdit,
        blockedReason,
        actions
    }: Props = $props();

    let dialogOpen = $state(false);
    let withdrawing = $state(false);
    let registering = $state(false);

    const status = $derived(registration ? REGISTRATION_STATUS[registration.status] : null);
    const account = $derived(accounts.find((item) => item.id === registration?.riotAccountId));

    async function register() {
        if (registering || !canRegister || registration) return;
        registering = true;
        try {
            const positions = previousPositions.length
                ? previousPositions
                : POSITIONS.map((item) => item.key);
            const accountId =
                accounts.find((item) => item.id === primaryAccountId)?.id ?? accounts[0]?.id ?? '';
            if (actions) {
                actions.register(accountId, positions);
                return;
            }
            const message = await postAction('register', {
                riotAccountId: accountId,
                positions: positions.join(',')
            });
            if (message) toast.error(message);
        } finally {
            registering = false;
        }
    }

    async function withdraw() {
        if (withdrawing) return;
        if (!(await confirm('신청을 철회할까요?', '신청 철회'))) return;
        withdrawing = true;
        try {
            if (actions) {
                actions.withdraw();
                return;
            }
            const message = await postAction('withdraw', {});
            if (message) toast.error(message);
        } finally {
            withdrawing = false;
        }
    }
</script>

<section
    class="panel flex min-w-0 flex-col gap-3 p-3.5"
    aria-labelledby="my-registration"
    aria-busy={registering || withdrawing}
>
    <div class="flex items-center justify-between gap-2">
        <h2 id="my-registration" class="text-[15px] font-bold">내 신청</h2>
        {#if registration && status}
            <StatusTag
                text={MY_REGISTRATION[registration.status] ?? status.text}
                state={status.state ?? 'neutral'}
            />
        {/if}
    </div>

    {#if registration && status}
        <dl class="grid grid-cols-[4.75rem_minmax(0,1fr)] items-center gap-y-2 text-ui">
            <dt class="text-muted">희망 포지션</dt>
            <dd><PositionChips positions={registration.positions as LolPosition[]} /></dd>
            <dt class="text-muted">Riot 계정</dt>
            <dd class="font-semibold wrap-anywhere">
                {registration.riotAccountId ? (account?.riotId ?? '연결이 해제된 계정') : '계정 없이 참가'}
            </dd>
        </dl>
        {#if canEdit}
            <div class="flex justify-end gap-2 border-t border-line pt-1">
                <Button variant="quiet" loading={withdrawing} onclick={withdraw}>신청 철회</Button>
                <Button variant="secondary" disabled={withdrawing} onclick={() => (dialogOpen = true)}>
                    수정
                </Button>
            </div>
        {/if}
    {:else if blockedReason}
        <p class="text-sm text-muted">{blockedReason}</p>
    {:else if canRegister}
        <Button variant="primary" size="sm" loading={registering} disabled={registering} onclick={register}>
            신청하기
        </Button>
    {/if}
</section>

{#if registration && canEdit}
    <RegistrationDialog
        bind:open={dialogOpen}
        editing
        {accounts}
        accountId={registration.riotAccountId ?? primaryAccountId ?? ''}
        positions={registration.positions as LolPosition[]}
        onsave={actions?.update}
    />
{/if}
