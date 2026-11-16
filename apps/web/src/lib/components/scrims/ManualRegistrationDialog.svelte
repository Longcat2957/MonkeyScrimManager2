<script lang="ts">
    import { tick, untrack } from 'svelte';
    import { deserialize } from '$app/forms';
    import { invalidateAll } from '$app/navigation';
    import { Button, CheckboxItem, Input, Popup } from 'stdf';
    import PageNav from '#lib/components/common/PageNav.svelte';
    import type { ManualRegistrationResult, ScrimParticipant } from '#lib/features/scrims/types.ts';
    import { playCapacity, RESERVE_CAPACITY, TEAM_COUNT } from '#lib/features/scrims/settings.ts';
    import { inputLabel, nonSubmitButtons } from '#lib/ui/form.ts';
    import { overlay } from '#lib/ui/overlay.ts';
    import { desktop } from '#lib/ui/viewport.svelte.ts';

    type MemberOption = { userId: string; displayName: string; username: string | null };
    type Options = { members: MemberOption[]; total: number; page: number };
    type MemberResult = { member: MemberOption; result: ManualRegistrationResult };
    let { open = $bindable(false), participants }: { open: boolean; participants: ScrimParticipant[] } =
        $props();

    let panel = $state<HTMLDivElement>();
    let feedback = $state<HTMLElement>();
    let popupPosition = $state<'center' | 'bottom'>('bottom');
    let query = $state('');
    let appliedQuery = $state('');
    let options = $state<Options>({ members: [], total: 0, page: 1 });
    let loading = $state(false);
    let selected = $state<MemberOption[]>([]);
    let results = $state<MemberResult[]>([]);
    let adding = $state(false);
    let refreshRequired = $state(false);
    let error = $state('');
    let generation = 0;
    const joined = $derived(
        new Set(
            participants
                .filter((player) => ['selected', 'standby'].includes(player.status))
                .map((player) => player.userId)
        )
    );
    const busy = $derived(loading || adding);
    const pending = $derived(selected.filter((member) => !joined.has(member.userId)));
    const retrying = $derived(
        pending.length > 0 &&
            pending.every((member) =>
                results.some(
                    (entry) => entry.member.userId === member.userId && entry.result.status === 'failed'
                )
            )
    );
    const maximum = playCapacity(TEAM_COUNT.max) + RESERVE_CAPACITY.max;

    $effect(() => {
        if (!open) popupPosition = desktop.current ? 'center' : 'bottom';
    });

    $effect(() => {
        if (!open) return;
        untrack(() => {
            query = '';
            selected = [];
            results = [];
            refreshRequired = false;
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
        if (!adding) open = false;
    }

    function toggle(member: MemberOption) {
        if (busy || refreshRequired || joined.has(member.userId)) return;
        if (selected.some((value) => value.userId === member.userId))
            selected = selected.filter((value) => value.userId !== member.userId);
        else if (pending.length < maximum) selected = [...pending, member];
        else error = `한 번에 ${maximum}명까지 선택할 수 있어요.`;
    }

    function exposeSelection(userId: string) {
        return (fieldset: HTMLFieldSetElement) => {
            const button = fieldset.querySelector('button');
            if (!button) return;
            button.type = 'button';
            button.setAttribute('role', 'checkbox');
            button.setAttribute('aria-checked', String(pending.some((member) => member.userId === userId)));
        };
    }

    async function refreshParticipants() {
        try {
            await invalidateAll();
            await tick();
            selected = selected.filter((member) => !joined.has(member.userId));
            refreshRequired = false;
            return true;
        } catch {
            refreshRequired = true;
            error = '참가 현황을 불러오지 못했어요. 다시 확인해 주세요.';
            return false;
        }
    }

    async function submit() {
        if (busy || (!refreshRequired && !pending.length)) return;
        adding = true;
        error = '';
        try {
            if (refreshRequired) {
                await refreshParticipants();
                return;
            }
            const submitted = [...pending];
            const body = new FormData();
            for (const member of submitted) body.append('userId', member.userId);
            const response = await fetch('?/addParticipant', {
                method: 'POST',
                body,
                headers: { 'x-sveltekit-action': 'true' }
            });
            const result = deserialize(await response.text());
            if (result.type === 'success' && Array.isArray(result.data?.registrationResults)) {
                const outcomes = result.data.registrationResults as ManualRegistrationResult[];
                if (submitted.some((member) => !outcomes.some((outcome) => outcome.userId === member.userId)))
                    throw new Error('참가자 추가 결과가 누락됐어요');
                results = submitted.map((member) => ({
                    member,
                    result: outcomes.find((outcome) => outcome.userId === member.userId)!
                }));
                selected = results
                    .filter((entry) => entry.result.status === 'failed')
                    .map((entry) => entry.member);
                await refreshParticipants();
            } else if (result.type === 'failure') {
                error = String(result.data?.message ?? '참가자를 추가하지 못했어요');
                refreshRequired = result.status >= 429;
            } else {
                refreshRequired = true;
                error = '추가 결과를 확인하지 못했어요. 참가 현황을 다시 확인해 주세요.';
            }
        } catch {
            // 응답이 유실되면 다시 보내기 전에 실제 참가 현황에서 성공한 대상을 제외한다.
            refreshRequired = true;
            error = '추가 결과를 확인하지 못했어요. 참가 현황을 다시 확인해 주세요.';
        } finally {
            adding = false;
            await tick();
            (feedback ?? panel?.querySelector<HTMLInputElement>('input'))?.focus();
        }
    }
</script>

<div {@attach overlay({ open, label: '참가자 추가', onclose: close })}>
    <Popup bind:visible={open} position={popupPosition} size={0} maskClosable={false} transparent>
        <div
            bind:this={panel}
            aria-busy={busy}
            class="mx-auto flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-t-(--radius-box) bg-bg-surface lg:rounded-(--radius-box) dark:bg-bg-surface-dark"
        >
            <div class="flex shrink-0 items-center justify-between gap-3 px-6 py-4">
                <h2 class="text-lg font-semibold">참가자 추가</h2>
                <Button
                    type="button"
                    fill="text"
                    size="auto"
                    heightOut="0"
                    injClass="min-h-11 px-3"
                    disabled={adding}
                    onclick={close}>닫기</Button
                >
            </div>
            <div class="flex min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain px-6 pb-4">
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
                {#if error || results.length}
                    <section bind:this={feedback} tabindex="-1" aria-label="참가자 추가 결과" class="text-sm">
                        {#if error}<p role="alert" class="text-error">{error}</p>{/if}
                        {#if results.length}
                            <ul aria-label="추가 결과" class="space-y-2">
                                {#each results as { member, result } (member.userId)}
                                    <li>
                                        <span class="font-medium wrap-anywhere">{member.displayName}</span>
                                        {#if member.username !== member.displayName}
                                            <span class="text-text-muted">
                                                ({member.username
                                                    ? `@${member.username}`
                                                    : member.userId})</span
                                            >
                                        {/if}
                                        <p class={result.status === 'failed' ? 'text-error' : 'text-success'}>
                                            {result.status === 'failed'
                                                ? result.message
                                                : result.status === 'selected'
                                                  ? '선발로 추가했어요'
                                                  : '대기로 추가했어요'}
                                        </p>
                                    </li>
                                {/each}
                            </ul>
                        {/if}
                    </section>
                {/if}
                {#if options.members.length}
                    <ul data-member-options aria-label="추가할 서버 멤버" class="divide-y divide-border">
                        {#each options.members as member (member.userId)}
                            <li>
                                <fieldset
                                    disabled={busy || refreshRequired || joined.has(member.userId)}
                                    class="[&_button]:min-h-16 [&_button]:w-full [&_button]:items-center [&_button]:py-3 [&_button>div:last-child]:min-w-0 [&_button>div:last-child]:flex-1"
                                    {@attach exposeSelection(member.userId)}
                                >
                                    <CheckboxItem
                                        name={member.userId}
                                        checked={pending.some((value) => value.userId === member.userId)}
                                        onclick={() => toggle(member)}
                                    >
                                        <span class="block min-w-0 text-left">
                                            <span class="block font-medium wrap-anywhere"
                                                >{member.displayName}</span
                                            >
                                            {#if member.username && member.username !== member.displayName}
                                                <span class="block text-sm text-text-muted wrap-anywhere"
                                                    >@{member.username}</span
                                                >
                                            {/if}
                                            {#if !member.username}<span
                                                    class="block text-sm text-text-muted wrap-anywhere"
                                                    >{member.userId}</span
                                                >{/if}
                                            {#if joined.has(member.userId)}<span
                                                    class="block text-sm text-text-muted">참가 중</span
                                                >{/if}
                                        </span>
                                    </CheckboxItem>
                                </fieldset>
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
            <div class="shrink-0 border-t border-border px-6 py-4">
                <Button
                    type="button"
                    size="full"
                    heightOut="0"
                    injClass="min-h-11"
                    disabled={busy || (!refreshRequired && !pending.length)}
                    loading={adding ? {} : null}
                    onclick={submit}
                    >{refreshRequired
                        ? '참가 현황 다시 확인'
                        : retrying
                          ? `실패한 ${pending.length}명 다시 추가`
                          : `선택한 ${pending.length}명 추가`}</Button
                >
            </div>
        </div>
    </Popup>
</div>
