<script lang="ts">
    import Button from '#lib/components/common/Button.svelte';
    import Dialog from '#lib/components/common/Dialog.svelte';
    import TextField from '#lib/components/common/TextField.svelte';
    import StatusTag from '#lib/components/common/StatusTag.svelte';
    import { enhance, type SubmitFunction } from '$app/forms';
    import { tick } from 'svelte';
    import { parseRiotId, RIOT_ID_FORMAT_ERROR } from '#lib/features/me/riot-id.ts';
    import type { RiotAccount, RiotLookup } from '#lib/features/me/types.ts';
    import { postAction } from '#lib/ui/actions.ts';
    import { confirm } from '#lib/ui/confirm.ts';
    import { preventComposingSubmit } from '#lib/ui/form.ts';
    import { toast } from '#lib/ui/toast.ts';

    type Member = { userId: string; displayName: string; riotAccounts: RiotAccount[] };

    // 운영자가 멤버의 Riot 계정을 연결·해제하고 대표 계정을 정한다. 연결은 조회 → 확인 두 단계다.
    let { open = $bindable(false), member }: { open: boolean; member: Member | null } = $props();
    let panel: HTMLDivElement | undefined = $state();

    let riotId = $state('');
    let error = $state('');
    let pending = $state(false);
    // 조회로 찾은 계정. 값이 있으면 연결 확인 단계를 보여 준다.
    let found = $state<RiotLookup | null>(null);
    let busyId = $state<string | null>(null);
    let busyAction = $state<'primary' | 'unlink' | null>(null);
    const busy = $derived(pending || Boolean(busyId));

    function reset() {
        riotId = '';
        error = '';
        found = null;
    }

    function close() {
        if (busy) return;
        open = false;
        reset();
    }

    async function run(name: 'primary' | 'unlink', account: RiotAccount) {
        if (busy || !member) return;
        const userId = member.userId;
        busyId = account.id;
        busyAction = name;
        try {
            if (
                name === 'unlink' &&
                !(await confirm(
                    `${account.gameName}#${account.tagLine} 연결을 해제할까요? 지난 경기 기록은 그대로 남아요.`,
                    '연결 해제'
                ))
            )
                return;
            const message = await postAction(name, { userId, id: account.id });
            if (message) toast.error(message);
        } finally {
            busyId = null;
            busyAction = null;
        }
    }

    const submitLookup: SubmitFunction = ({ formData, cancel }) => {
        if (busy || !member) {
            cancel();
            return;
        }
        if (!parseRiotId(riotId)) {
            error = RIOT_ID_FORMAT_ERROR;
            cancel();
            void tick().then(() => panel?.querySelector<HTMLInputElement>('input')?.focus());
            return;
        }
        formData.set('riotId', riotId);
        error = '';
        pending = true;
        return async ({ result }) => {
            try {
                if (result.type === 'success') {
                    found = result.data?.lookup as RiotLookup;
                } else if (result.type === 'failure') {
                    error = String(result.data?.riotIdError ?? '조회하지 못했어요. 다시 시도해 주세요');
                } else error = '조회하지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요';
            } finally {
                pending = false;
            }
            if (found && !error) {
                await tick();
                panel?.querySelector<HTMLButtonElement>('button[type="submit"]')?.focus();
            }
        };
    };

    const submitLink: SubmitFunction = ({ formData, cancel }) => {
        if (busy || !found || !member) {
            cancel();
            return;
        }
        // 연결 대상은 확인 화면에 표시한 조회 결과로 고정한다.
        formData.set('riotId', `${found.gameName}#${found.tagLine}`);
        formData.set('userId', member.userId);
        error = '';
        pending = true;
        return async ({ result, update }) => {
            try {
                if (result.type === 'success') {
                    await update();
                    reset();
                } else if (result.type === 'failure') {
                    error = String(
                        result.data?.riotIdError ??
                            result.data?.message ??
                            '연결하지 못했어요. 다시 시도해 주세요'
                    );
                } else error = '연결하지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요';
            } catch {
                error = '연결했지만 화면을 갱신하지 못했어요. 새로고침해 현재 상태를 확인해 주세요';
            } finally {
                pending = false;
            }
            if (!found && !error) {
                await tick();
                panel?.querySelector<HTMLInputElement>('input')?.focus();
            }
        };
    };
</script>

<Dialog bind:open title={`${member?.displayName ?? '멤버'}의 Riot 계정`} dismissible={!busy} onclose={close}>
    <div bind:this={panel} aria-busy={busy} class="flex min-w-0 flex-col gap-3">
        <p class="text-xs text-muted tabular-nums wrap-anywhere">{member?.userId}</p>

        {#if member?.riotAccounts.length}
            <ul class="divide-y divide-line border-y border-line">
                {#each member.riotAccounts as account (account.id)}
                    <li class="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                        <span class="flex min-w-[min(100%,9rem)] flex-1 flex-col">
                            <span class="flex flex-wrap items-center gap-2">
                                <span class="min-w-0 text-sm font-semibold wrap-anywhere"
                                    >{account.gameName}<span class="font-normal text-muted">
                                        #{account.tagLine}</span
                                    ></span
                                >
                                {#if account.isPrimary}<StatusTag text="대표" state="theme" />{/if}
                            </span>
                            {#if account.inActiveScrim}<span class="text-xs text-muted"
                                    >진행 중인 내전에 쓰여 해제할 수 없어요</span
                                >{/if}
                        </span>
                        <span class="ml-auto flex flex-wrap items-center justify-end gap-1">
                            {#if !account.isPrimary}
                                <Button
                                    variant="quiet"
                                    disabled={busy}
                                    loading={busyId === account.id && busyAction === 'primary'}
                                    onclick={() => run('primary', account)}
                                    >대표로<span class="sr-only">
                                        {account.gameName}#{account.tagLine}</span
                                    ></Button
                                >
                            {/if}
                            <Button
                                variant="danger"
                                disabled={busy || account.inActiveScrim}
                                loading={busyId === account.id && busyAction === 'unlink'}
                                onclick={() => run('unlink', account)}
                            >
                                해제<span class="sr-only"> {account.gameName}#{account.tagLine}</span>
                            </Button>
                        </span>
                    </li>
                {/each}
            </ul>
        {:else}
            <p class="border-y border-line py-3 text-ui text-muted">연결된 계정이 없어요</p>
        {/if}

        {#if !found}
            <form
                method="POST"
                action="?/lookup"
                class="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2"
                novalidate
                use:enhance={submitLookup}
                {@attach preventComposingSubmit}
            >
                <TextField
                    label="연결할 Riot ID"
                    placeholder="이름#태그"
                    bind:value={riotId}
                    disabled={busy}
                    {error}
                    autocomplete="off"
                    required
                />
                <div class="mt-5">
                    <Button variant="primary" type="submit" loading={pending}>조회</Button>
                </div>
            </form>
        {:else}
            <form
                method="POST"
                action="?/link"
                class="flex flex-col gap-3"
                novalidate
                use:enhance={submitLink}
                {@attach preventComposingSubmit}
            >
                <div
                    class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-(--radius-form) bg-surface-2 px-3 py-2"
                >
                    <span class="min-w-0 font-semibold wrap-anywhere"
                        >{found.gameName}<span class="font-normal text-muted">#{found.tagLine}</span></span
                    >
                    <span class="text-xs text-muted">{found.region} 서버</span>
                </div>
                {#if error}
                    <p role="alert" class="text-sm text-error">{error}</p>
                {:else}
                    <p class="text-ui text-ink-2">이 Riot 계정을 연결할까요?</p>
                {/if}
                <div class="flex justify-end gap-2">
                    <Button variant="secondary" disabled={busy} onclick={() => ((found = null), (error = ''))}
                        >다시 입력</Button
                    >
                    <Button variant="primary" type="submit" loading={pending}>연결</Button>
                </div>
            </form>
        {/if}
    </div>
</Dialog>
