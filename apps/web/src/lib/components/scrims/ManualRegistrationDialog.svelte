<script lang="ts">
    import { tick, untrack } from 'svelte';
    import { deserialize } from '$app/forms';
    import { invalidateAll } from '$app/navigation';
    import Button from '#lib/components/common/Button.svelte';
    import Dialog from '#lib/components/common/Dialog.svelte';
    import PageNav from '#lib/components/common/PageNav.svelte';
    import Spinner from '#lib/components/common/Spinner.svelte';
    import TextField from '#lib/components/common/TextField.svelte';
    import type { ManualRegistrationResult, ScrimParticipant } from '#lib/features/scrims/types.ts';
    import { playCapacity, RESERVE_CAPACITY, TEAM_COUNT } from '#lib/features/scrims/settings.ts';
    import { toast } from '#lib/ui/toast.ts';

    type MemberOption = { userId: string; displayName: string; username: string | null };
    type Options = { members: MemberOption[]; total: number; page: number };
    type MemberResult = { member: MemberOption; result: ManualRegistrationResult };
    let { open = $bindable(false), participants }: { open: boolean; participants: ScrimParticipant[] } =
        $props();

    let feedback = $state<HTMLElement>();
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
    const submitText = $derived(
        refreshRequired
            ? '참가 현황 다시 확인'
            : retrying
              ? `실패한 ${pending.length}명 다시 추가`
              : `선택한 ${pending.length}명 추가`
    );

    // 열 때마다 검색 조건과 결과를 비우고 첫 쪽부터 다시 읽는다.
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

    function toggle(member: MemberOption, checked: boolean) {
        if (busy || refreshRequired || joined.has(member.userId)) return;
        if (!checked) selected = pending.filter((value) => value.userId !== member.userId);
        else if (pending.length < maximum) selected = [...pending, member];
        else toast.info(`한 번에 ${maximum}명까지 선택할 수 있어요.`);
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
            // 결과가 있으면 결과로, 없으면 네이티브 dialog의 포커스 복귀에 맡긴다.
            feedback?.focus();
        }
    }
</script>

<!-- 추가 중에는 닫기·Escape·바깥 클릭을 막고, 끝나면 네이티브 dialog가 이전 포커스로 돌려보낸다. -->
<Dialog bind:open title="참가자 추가" dismissible={false} oncancel={close}>
    <div class="flex flex-col gap-3">
        <form
            method="POST"
            action="?/participantOptions"
            role="search"
            class="flex items-end gap-2"
            onsubmit={(event) => {
                event.preventDefault();
                if (!busy) void search(query.trim(), 1);
            }}
        >
            <div class="min-w-0 flex-1">
                <TextField
                    label="서버 멤버 검색"
                    placeholder="서버 별명 또는 사용자명"
                    maxlength={50}
                    bind:value={query}
                    disabled={busy}
                />
            </div>
            <Button variant="secondary" type="submit" class="shrink-0" disabled={busy} {loading}>검색</Button>
        </form>
        <p class="text-xs text-muted">
            Riot 계정이 있으면 대표 계정을 사용하고, 희망 포지션은 무관으로 추가해요.
        </p>
        {#if loading}
            <div class="flex justify-center"><Spinner label="멤버를 불러오는 중" /></div>
        {/if}
        {#if error || results.length}
            <section bind:this={feedback} tabindex="-1" aria-label="참가자 추가 결과" class="text-sm">
                {#if error}<p role="alert" class="text-error">{error}</p>{/if}
                {#if results.length}
                    <ul
                        aria-label="추가 결과"
                        class="divide-y divide-line rounded-form border border-line bg-surface-2"
                    >
                        {#each results as { member, result } (member.userId)}
                            <li class="flex flex-wrap items-baseline gap-x-2 px-3 py-2 text-ui">
                                <span class="font-medium wrap-anywhere">{member.displayName}</span>
                                {#if member.username !== member.displayName}
                                    <span class="text-muted">
                                        ({member.username ? `@${member.username}` : member.userId})</span
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
            <fieldset disabled={busy || refreshRequired} aria-label="추가할 서버 멤버">
                <ul data-member-options class="divide-y divide-line border-y border-line">
                    {#each options.members as member (member.userId)}
                        <li>
                            <!-- 행 전체가 하나의 체크박스 조작 영역이다. -->
                            <label
                                class={[
                                    'flex min-h-11 w-full items-center gap-3 px-2.5 py-2',
                                    joined.has(member.userId) || busy || refreshRequired
                                        ? 'cursor-not-allowed opacity-60'
                                        : 'cursor-pointer hover:bg-surface-hover has-checked:bg-selected'
                                ]}
                            >
                                <input
                                    type="checkbox"
                                    class="size-4 shrink-0 accent-[var(--color-nexus)]"
                                    checked={pending.some((value) => value.userId === member.userId)}
                                    aria-checked={pending.some((value) => value.userId === member.userId)}
                                    disabled={busy || refreshRequired || joined.has(member.userId)}
                                    onchange={(event) => {
                                        toggle(member, event.currentTarget.checked);
                                        // 선택 한도에 걸려 상태가 그대로면 눌린 표시도 되돌린다.
                                        event.currentTarget.checked = pending.some(
                                            (value) => value.userId === member.userId
                                        );
                                    }}
                                />
                                <span class="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 text-left">
                                    <span class="font-semibold wrap-anywhere">{member.displayName}</span>
                                    {#if member.username && member.username !== member.displayName}
                                        <span class="text-xs text-muted wrap-anywhere"
                                            >@{member.username}</span
                                        >
                                    {/if}
                                    {#if !member.username}<span class="text-xs text-muted wrap-anywhere"
                                            >{member.userId}</span
                                        >{/if}
                                    {#if joined.has(member.userId)}<span class="ml-auto text-xs text-muted"
                                            >참가 중</span
                                        >{/if}
                                </span>
                            </label>
                        </li>
                    {/each}
                </ul>
            </fieldset>
        {:else if !loading && !error}
            <p class="py-6 text-center text-sm text-muted">
                {appliedQuery
                    ? `'${appliedQuery}'에 맞는 멤버가 없어요`
                    : '등록된 서버 멤버가 없어요. Discord에서 /초기설정을 실행해 주세요.'}
            </p>
        {/if}
        <fieldset disabled={busy || refreshRequired} aria-label="서버 멤버 페이지">
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

    {#snippet footer()}
        <div class="flex flex-wrap items-center justify-end gap-2">
            <Button variant="quiet" type="button" disabled={adding} onclick={close}>닫기</Button>
            <Button
                variant="primary"
                type="button"
                disabled={busy || (!refreshRequired && !pending.length)}
                loading={adding}
                onclick={submit}>{submitText}</Button
            >
        </div>
    {/snippet}
</Dialog>
