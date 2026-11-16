<script lang="ts">
    import { tick, untrack } from 'svelte';
    import { deserialize } from '$app/forms';
    import { Button, Input, Popup } from 'stdf';
    import PageNav from '#lib/components/common/PageNav.svelte';
    import type { ScrimParticipant } from '#lib/features/scrims/types.ts';
    import { inputLabel, nonSubmitButtons } from '#lib/ui/form.ts';
    import { postAction } from '#lib/ui/actions.ts';
    import { overlay } from '#lib/ui/overlay.ts';
    import { desktop } from '#lib/ui/viewport.svelte.ts';

    type MemberOption = { userId: string; displayName: string; username: string | null };
    type Options = { members: MemberOption[]; total: number; page: number };
    let { open = $bindable(false), participants }: { open: boolean; participants: ScrimParticipant[] } =
        $props();

    let panel = $state<HTMLDivElement>();
    let popupPosition = $state<'center' | 'bottom'>('bottom');
    let query = $state('');
    let appliedQuery = $state('');
    let options = $state<Options>({ members: [], total: 0, page: 1 });
    let loading = $state(false);
    let addingId = $state<string | null>(null);
    let error = $state('');
    let generation = 0;
    const joined = $derived(
        new Set(
            participants
                .filter((player) => ['selected', 'standby'].includes(player.status))
                .map((player) => player.userId)
        )
    );
    const busy = $derived(loading || addingId !== null);

    $effect(() => {
        if (!open) popupPosition = desktop.current ? 'center' : 'bottom';
    });

    $effect(() => {
        if (!open) return;
        untrack(() => {
            query = '';
            options = { members: [], total: 0, page: 1 };
            void search('', 1);
        });
        return () => {
            generation++;
        };
    });

    async function search(q: string, page: number) {
        const request = ++generation;
        loading = true;
        error = '';
        const body = new FormData();
        body.set('q', q);
        body.set('page', String(page));
        try {
            const response = await fetch('?/participantOptions', {
                method: 'POST',
                body,
                headers: { 'x-sveltekit-action': 'true' },
                signal: AbortSignal.timeout(15000)
            });
            const result = deserialize(await response.text());
            if (request !== generation) return;
            if (result.type === 'success' && result.data?.memberOptions) {
                options = result.data.memberOptions as Options;
                appliedQuery = q;
            } else
                error =
                    result.type === 'failure'
                        ? String(result.data?.message ?? '멤버를 불러오지 못했어요')
                        : '멤버를 불러오지 못했어요';
        } catch {
            if (request === generation)
                error = '멤버를 불러오지 못했어요. 연결을 확인하고 다시 검색해 주세요.';
        } finally {
            if (request === generation) loading = false;
        }
    }

    function close() {
        if (!addingId) open = false;
    }

    async function add(member: MemberOption) {
        if (busy || joined.has(member.userId)) return;
        addingId = member.userId;
        error = '';
        try {
            const message = await postAction('addParticipant', { userId: member.userId });
            if (message) error = message;
        } finally {
            addingId = null;
            await tick();
            // 검색 결과 한 명을 추가해 버튼이 비활성화된 경우에도 포커스를 팝업 안에 유지한다.
            const next =
                panel?.querySelector<HTMLButtonElement>('[data-member-options] button:not(:disabled)') ??
                panel?.querySelector<HTMLInputElement>('input');
            next?.focus();
        }
    }
</script>

<div {@attach overlay({ open, label: '참가자 추가', onclose: close })}>
    <Popup bind:visible={open} position={popupPosition} size={0} maskClosable={false} transparent>
        <div
            bind:this={panel}
            aria-busy={busy}
            class="mx-auto flex max-h-[90dvh] w-full max-w-md flex-col gap-4 overflow-y-auto overscroll-contain rounded-t-(--radius-box) bg-bg-surface p-6 lg:rounded-(--radius-box) dark:bg-bg-surface-dark"
        >
            <div class="flex items-center justify-between gap-3">
                <h2 class="text-lg font-semibold">참가자 추가</h2>
                <Button
                    type="button"
                    fill="text"
                    size="auto"
                    heightOut="0"
                    injClass="min-h-11 px-3"
                    disabled={addingId !== null}
                    onclick={close}>닫기</Button
                >
            </div>
            <form
                method="POST"
                action="?/participantOptions"
                role="search"
                class="flex items-end gap-2"
                {@attach nonSubmitButtons}
                onsubmit={(event) => {
                    event.preventDefault();
                    if (!busy) void search(query.trim(), 1);
                }}
            >
                <div class="min-w-0 flex-1" {@attach inputLabel('서버 멤버 검색')}>
                    <Input
                        title="서버 멤버 검색"
                        type="search"
                        placeholder="서버 별명 또는 사용자명"
                        maxlength={50}
                        bind:value={query}
                        disabled={busy}
                        clear
                    />
                </div>
                <Button
                    type="submit"
                    size="auto"
                    heightOut="0"
                    injClass="min-h-11 shrink-0 px-4"
                    disabled={busy}
                    loading={loading ? {} : null}>검색</Button
                >
            </form>
            <p class="text-sm text-text-muted">
                Riot 계정이 있으면 대표 계정을 사용하고, 희망 포지션은 무관으로 추가해요.
            </p>
            {#if error}
                <p role="alert" class="text-sm text-error">{error}</p>
            {/if}
            {#if options.members.length}
                <ul data-member-options aria-label="추가할 서버 멤버" class="divide-y divide-border">
                    {#each options.members as member (member.userId)}
                        <li class="flex min-h-16 items-center gap-3 py-2">
                            <span class="min-w-0 flex-1">
                                <span class="block font-medium wrap-anywhere">{member.displayName}</span>
                                {#if member.username && member.username !== member.displayName}
                                    <span class="block text-sm text-text-muted wrap-anywhere"
                                        >@{member.username}</span
                                    >
                                {/if}
                            </span>
                            <Button
                                type="button"
                                size="auto"
                                heightOut="0"
                                injClass="min-h-11 shrink-0 px-3 text-sm"
                                disabled={busy || joined.has(member.userId)}
                                loading={addingId === member.userId ? {} : null}
                                onclick={() => add(member)}
                            >
                                {joined.has(member.userId) ? '참가 중' : '추가'}<span class="sr-only">
                                    {member.displayName}</span
                                >
                            </Button>
                        </li>
                    {/each}
                </ul>
            {:else if !loading && !error}
                <p class="py-6 text-center text-sm text-text-muted">
                    {appliedQuery
                        ? `'${appliedQuery}'에 맞는 멤버가 없어요`
                        : '등록된 서버 멤버가 없어요. Discord에서 /초기설정을 실행해 주세요.'}
                </p>
            {/if}
            <fieldset disabled={busy} aria-label="서버 멤버 페이지">
                <PageNav
                    total={options.total}
                    pageSize={20}
                    current={options.page}
                    label="서버 멤버"
                    onchange={(page) => {
                        if (!busy) void search(appliedQuery, page);
                    }}
                />
            </fieldset>
        </div>
    </Popup>
</div>
