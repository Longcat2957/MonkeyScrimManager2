<script lang="ts">
    import { Button, Input, Popup, toast } from 'stdf';
    import { enhance, type SubmitFunction } from '$app/forms';
    import StatusTag from '#lib/components/common/StatusTag.svelte';
    import { parseRiotId, RIOT_ID_FORMAT_ERROR } from '#lib/features/me/riot-id.ts';
    import type { RiotAccount, RiotLookup } from '#lib/features/me/types.ts';
    import { postAction } from '#lib/ui/actions.ts';
    import { confirm } from '#lib/ui/confirm.ts';
    import { overlay } from '#lib/ui/overlay.ts';
    import { desktop } from '#lib/ui/viewport.svelte.ts';

    type Member = { userId: string; displayName: string; riotAccounts: RiotAccount[] };

    // 운영자가 멤버의 Riot 계정을 연결·해제하고 대표 계정을 정한다. 연결은 조회 → 확인 두 단계다.
    let { open = $bindable(false), member }: { open: boolean; member: Member | null } = $props();

    let riotId = $state('');
    let error = $state('');
    let pending = $state(false);
    // 조회로 찾은 계정. 값이 있으면 연결 확인 단계를 보여 준다.
    let found = $state<RiotLookup | null>(null);
    let busyId = $state<string | null>(null);

    function reset() {
        riotId = '';
        error = '';
        found = null;
    }

    function close() {
        if (pending || busyId) return;
        open = false;
        reset();
    }

    async function run(name: 'primary' | 'unlink', account: RiotAccount) {
        if (!member) return;
        if (
            name === 'unlink' &&
            !(await confirm(
                `${account.gameName}#${account.tagLine} 연결을 해제할까요? 지난 경기 기록은 그대로 남아요.`,
                '연결 해제'
            ))
        )
            return;
        busyId = account.id;
        const message = await postAction(name, { userId: member.userId, id: account.id });
        busyId = null;
        if (message) toast.error(message);
    }

    const submitLookup: SubmitFunction = ({ formData, cancel }) => {
        if (pending || !member) {
            cancel();
            return;
        }
        if (!parseRiotId(riotId)) {
            error = RIOT_ID_FORMAT_ERROR;
            cancel();
            return;
        }
        formData.set('riotId', riotId);
        error = '';
        pending = true;
        return async ({ result }) => {
            pending = false;
            if (result.type === 'success') found = result.data?.lookup as RiotLookup;
            else if (result.type === 'failure')
                error = String(result.data?.riotIdError ?? '조회하지 못했어요');
            else error = '조회하지 못했어요';
        };
    };

    const submitLink: SubmitFunction = ({ formData, cancel }) => {
        if (pending || !found || !member) {
            cancel();
            return;
        }
        // 연결 대상은 확인 화면에 표시한 조회 결과로 고정한다.
        formData.set('riotId', `${found.gameName}#${found.tagLine}`);
        formData.set('userId', member.userId);
        error = '';
        pending = true;
        return async ({ result, update }) => {
            pending = false;
            if (result.type === 'success') {
                await update();
                reset();
            } else if (result.type === 'failure') {
                error = String(result.data?.riotIdError ?? result.data?.message ?? '연결하지 못했어요');
            } else {
                error = '연결하지 못했어요';
            }
        };
    };
</script>

<div {@attach overlay({ open, label: 'Riot 계정 관리', onclose: close })}>
    <Popup
        bind:visible={open}
        position={desktop.current ? 'center' : 'bottom'}
        size={0}
        maskClosable={false}
        transparent
    >
        <div
            class="mx-auto flex w-full max-w-md flex-col gap-5 rounded-t-(--radius-box) bg-bg-surface p-6 lg:rounded-(--radius-box) dark:bg-bg-surface-dark"
        >
            <h2 class="text-lg font-semibold">{member?.displayName}의 Riot 계정</h2>

            {#if member?.riotAccounts.length}
                <ul
                    class="flex flex-col divide-y divide-text-primary/5 rounded-(--radius-form) border border-border dark:divide-text-dark/5"
                >
                    {#each member.riotAccounts as account (account.id)}
                        <li class="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                            <span class="flex min-w-0 flex-1 flex-col">
                                <span class="flex items-center gap-2">
                                    <span class="truncate font-medium"
                                        >{account.gameName}<span class="font-normal opacity-60">
                                            #{account.tagLine}</span
                                        ></span
                                    >
                                    {#if account.isPrimary}<StatusTag text="대표" state="theme" />{/if}
                                </span>
                                {#if account.inActiveScrim}<span class="text-xs opacity-60"
                                        >진행 중인 내전에 쓰여 해제할 수 없어요</span
                                    >{/if}
                            </span>
                            <span class="flex shrink-0 items-center">
                                {#if !account.isPrimary}
                                    <Button
                                        fill="text"
                                        size="auto"
                                        heightOut="0"
                                        heightIn="2"
                                        injClass="px-2 text-sm"
                                        disabled={Boolean(busyId)}
                                        onclick={() => run('primary', account)}>대표로</Button
                                    >
                                {/if}
                                <Button
                                    fill="textState"
                                    state="error"
                                    size="auto"
                                    heightOut="0"
                                    heightIn="2"
                                    injClass="px-2 text-sm"
                                    disabled={Boolean(busyId) || account.inActiveScrim}
                                    onclick={() => run('unlink', account)}
                                >
                                    해제<span class="sr-only"> {account.gameName}#{account.tagLine}</span>
                                </Button>
                            </span>
                        </li>
                    {/each}
                </ul>
            {:else}
                <p class="text-sm opacity-70">연결된 계정이 없어요</p>
            {/if}

            {#if !found}
                <form
                    method="POST"
                    action="?/lookup"
                    class="flex flex-col gap-3"
                    novalidate
                    use:enhance={submitLookup}
                >
                    <Input
                        title="연결할 Riot ID"
                        titlePosition="out"
                        placeholder="이름#태그"
                        bind:value={riotId}
                        disabled={pending}
                        state={error ? 'error' : 'theme'}
                        tip={error || null}
                        autocomplete={false}
                        required
                    />
                    <div class="flex justify-end gap-2">
                        <Button
                            type="button"
                            fill="lineLight"
                            size="auto"
                            heightOut="0"
                            injClass="px-4"
                            onclick={close}>닫기</Button
                        >
                        <Button
                            type="submit"
                            size="auto"
                            heightOut="0"
                            injClass="px-4"
                            loading={pending ? {} : null}>조회</Button
                        >
                    </div>
                </form>
            {:else}
                <form
                    method="POST"
                    action="?/link"
                    class="flex flex-col gap-3"
                    novalidate
                    use:enhance={submitLink}
                >
                    <div
                        class="flex flex-col gap-1 rounded-(--radius-form) bg-bg-overlay px-4 py-3 dark:bg-bg-overlay-dark"
                    >
                        <span class="font-semibold break-all"
                            >{found.gameName}<span class="font-normal opacity-60">
                                #{found.tagLine}</span
                            ></span
                        >
                        <span class="text-sm opacity-70">{found.region} 서버</span>
                    </div>
                    {#if error}
                        <p role="alert" class="text-sm text-error">{error}</p>
                    {:else}
                        <p class="text-sm opacity-80">이 계정을 {member?.displayName}에게 연결할까요?</p>
                    {/if}
                    <div class="flex justify-end gap-2">
                        <Button
                            type="button"
                            fill="lineLight"
                            size="auto"
                            heightOut="0"
                            injClass="px-4"
                            disabled={pending}
                            onclick={() => ((found = null), (error = ''))}>다시 입력</Button
                        >
                        <Button
                            type="submit"
                            size="auto"
                            heightOut="0"
                            injClass="px-4"
                            loading={pending ? {} : null}>연결</Button
                        >
                    </div>
                </form>
            {/if}
        </div>
    </Popup>
</div>
