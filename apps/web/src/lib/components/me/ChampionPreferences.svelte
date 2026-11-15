<script lang="ts">
    import { tick, untrack } from 'svelte';
    import type { Attachment } from 'svelte/attachments';
    import { enhance, type SubmitFunction } from '$app/forms';
    import { invalidate } from '$app/navigation';
    import { navigating } from '$app/state';
    import { Button, Input } from 'stdf';
    import PageNav from '#lib/components/common/PageNav.svelte';
    import SelectionTabs from '#lib/components/common/SelectionTabs.svelte';
    import type { LolPosition } from '#lib/features/guild/types.ts';
    import { POSITIONS } from '#lib/features/labels.ts';
    import {
        MAX_PREFERRED_CHAMPIONS,
        type ChampionPreferenceInput,
        type ChampionPreferenceSelections,
        type MyChampionPreferences
    } from '#lib/features/me/champions.ts';
    import { inputLabel, nonSubmitButtons } from '#lib/ui/form.ts';

    type Props = {
        value: MyChampionPreferences;
        preview?: boolean;
        initialValues?: ChampionPreferenceInput;
        initialError?: string;
    };
    let { value, preview = false, initialValues, initialError = '' }: Props = $props();
    const id = $props.id();
    const PAGE_SIZE = 12;
    const clone = (selections: ChampionPreferenceSelections): ChampionPreferenceSelections =>
        Object.fromEntries(
            POSITIONS.map(({ key }) => [key, [...selections[key]]])
        ) as ChampionPreferenceSelections;
    const same = (left: number[], right: number[]) =>
        left.length === right.length && left.every((entry, index) => entry === right[index]);
    let active = $state(
        untrack(() =>
            Math.max(
                0,
                POSITIONS.findIndex(({ key }) => key === initialValues?.position)
            )
        )
    );
    let drafts = $state(
        untrack(() => {
            const next = clone(value.preferences);
            // 서버는 중복 요청을 거절하고, 오류 화면의 선택 조작만 고유 키로 안전하게 복원한다.
            if (initialValues) next[initialValues.position] = [...new Set(initialValues.championIds)];
            return next;
        })
    );
    let saved = $state.raw(untrack(() => clone(value.preferences)));
    let source = untrack(() => value.preferences);
    let query = $state('');
    let current = $state(1);
    let busy = $state(false);
    let reloading = $state(false);
    let refreshRequired = $state(false);
    let error = $state(untrack(() => initialError));
    let notice = $state('');
    let orderNotice = $state('');
    let searchContext = '';
    let form: HTMLFormElement;
    const position = $derived(POSITIONS[active]!.key);
    const positionName = $derived(POSITIONS[active]!.text);
    const selected = $derived(drafts[position]);
    const dirty = $derived(!same(selected, saved[position]));
    const locked = $derived(busy || reloading || refreshRequired || Boolean(navigating.to));
    const catalog = $derived(new Map(value.catalog.map((entry) => [entry.championId, entry])));
    const displayError = $derived(error || value.catalogError);
    const results = $derived.by(() => {
        const search = query.trim().toLocaleLowerCase('ko-KR');
        return value.catalog.filter(
            (entry) =>
                !selected.includes(entry.championId) &&
                (!search ||
                    entry.name.toLocaleLowerCase('ko-KR').includes(search) ||
                    entry.id.toLowerCase().includes(search))
        );
    });
    const name = (championId: number) => catalog.get(championId)?.name ?? `챔피언 #${championId}`;
    const searchInput: Attachment<HTMLDivElement> = (node) => {
        const keydown = (event: KeyboardEvent) => {
            if (event.key === 'Enter' && event.target instanceof HTMLInputElement) event.preventDefault();
        };
        node.addEventListener('keydown', keydown);
        return () => node.removeEventListener('keydown', keydown);
    };

    $effect(() => {
        const incoming = value.preferences;
        if (incoming === source) return;
        untrack(() => {
            // 다른 설정의 재조회나 한 포지션 저장으로 다른 포지션의 초안을 덮지 않는다.
            for (const { key } of POSITIONS) {
                if (same(drafts[key], saved[key])) drafts[key] = [...incoming[key]];
            }
            saved = clone(incoming);
            source = incoming;
        });
    });
    $effect(() => {
        const key = JSON.stringify([position, query]);
        const count = results.length;
        untrack(() => {
            current =
                key === searchContext ? Math.min(current, Math.max(1, Math.ceil(count / PAGE_SIZE))) : 1;
            searchContext = key;
        });
    });

    function choosePosition(index: number) {
        if (locked) return;
        active = index;
        current = 1;
        query = '';
        error = '';
        notice = '';
        orderNotice = '';
    }

    async function add(championId: number) {
        if (locked || selected.length >= MAX_PREFERRED_CHAMPIONS || selected.includes(championId)) return;
        drafts[position] = [...selected, championId];
        notice = '';
        orderNotice = `${name(championId)}을 ${positionName} ${selected.length}번째로 선택했어요.`;
        await tick();
        // 사라진 추가 버튼 대신 다음 검색 결과를 이어 고를 수 있게 한다.
        const next = form?.querySelector<HTMLButtonElement>('search li button:not(:disabled)');
        (next ?? form?.querySelector<HTMLInputElement>('search input:not([type="hidden"])'))?.focus();
    }

    async function remove(championId: number, index: number) {
        if (locked) return;
        drafts[position] = selected.filter((entry) => entry !== championId);
        notice = '';
        orderNotice = `${name(championId)}을 선택에서 제거했어요.`;
        await tick();
        const rows = form?.querySelectorAll<HTMLLIElement>('li[data-champion-id]');
        const next =
            rows?.[Math.min(index, rows.length - 1)]?.querySelector<HTMLButtonElement>(
                'button:not(:disabled)'
            );
        (next ?? form?.querySelector<HTMLInputElement>('search input:not([type="hidden"])'))?.focus();
    }

    async function move(championId: number, direction: -1 | 1) {
        if (locked) return;
        const index = selected.indexOf(championId);
        const nextIndex = index + direction;
        if (index < 0 || nextIndex < 0 || nextIndex >= selected.length) return;
        const trigger = form
            ?.querySelector<HTMLLIElement>(`li[data-champion-id="${championId}"]`)
            ?.querySelectorAll('button')[direction === -1 ? 0 : 1];
        const next = [...selected];
        [next[index], next[nextIndex]] = [next[nextIndex]!, next[index]!];
        drafts[position] = next;
        notice = '';
        orderNotice = `${name(championId)}을 ${nextIndex + 1}번째로 옮겼어요.`;
        await tick();
        // Svelte의 키 기반 이동에서 잃을 수 있는 포커스를 복원하고 끝 위치에서는 같은 행의 가능한 조작으로 이어 준다.
        if (trigger && !trigger.disabled) trigger.focus();
        else
            form?.querySelector<HTMLLIElement>(`li[data-champion-id="${championId}"]`)
                ?.querySelector<HTMLButtonElement>('button:not(:disabled)')
                ?.focus();
    }

    async function reload() {
        if (busy || reloading) return;
        reloading = true;
        error = '';
        notice = '';
        try {
            await invalidate('app:champion-preferences');
            refreshRequired = false;
        } catch {
            error = '목록을 다시 불러오지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.';
        } finally {
            reloading = false;
        }
    }

    const submit: SubmitFunction = ({ cancel }) => {
        if (locked || !dirty) {
            cancel();
            return;
        }
        const lane: LolPosition = position;
        const returnFocus = form.contains(document.activeElement);
        let savedSuccessfully = false;
        busy = true;
        error = '';
        notice = '';
        return async ({ result, update }) => {
            try {
                if (result.type === 'success') {
                    await update({ reset: false });
                    drafts[lane] = [...value.preferences[lane]];
                    saved = clone(value.preferences);
                    notice = `${POSITIONS.find(({ key }) => key === lane)!.text} 선호 챔피언을 저장했어요.`;
                    savedSuccessfully = true;
                } else if (result.type === 'failure') {
                    error = String(
                        result.data?.message ?? '선호 챔피언을 저장하지 못했어요. 다시 시도해 주세요.'
                    );
                } else {
                    refreshRequired = true;
                    error = '저장 결과를 확인하지 못했어요. 다시 불러와 현재 목록을 확인해 주세요.';
                }
            } catch {
                refreshRequired = true;
                error =
                    result.type === 'success'
                        ? '선호 챔피언은 저장했지만 화면을 갱신하지 못했어요. 다시 불러와 확인해 주세요.'
                        : '저장 결과를 확인하지 못했어요. 연결을 확인한 뒤 다시 불러와 주세요.';
            } finally {
                busy = false;
                await tick();
                if (
                    returnFocus &&
                    (document.activeElement === document.body || form.contains(document.activeElement))
                ) {
                    const next = savedSuccessfully
                        ? form.querySelectorAll<HTMLButtonElement>('fieldset button')[active]
                        : (form.querySelector<HTMLButtonElement>('button[type="submit"]:not(:disabled)') ??
                          form.querySelector<HTMLButtonElement>('button:not(:disabled)'));
                    next?.focus();
                }
            }
        };
    };
</script>

<section aria-labelledby={`${id}-title`} class="flex min-w-0 flex-col gap-4">
    <h2 id={`${id}-title`} class="text-lg font-semibold">선호 챔피언</h2>
    <p class="text-sm leading-6 text-text-muted">
        포지션마다 최대 {MAX_PREFERRED_CHAMPIONS}개를 원하는 순서로 저장해요. 프로필 정보를 공개하면 경매의
        포지션 참고 정보로 표시돼요.
    </p>
    <form
        bind:this={form}
        method="POST"
        action={preview ? '?mock=1&/champions' : '?/champions'}
        use:enhance={submit}
        {@attach nonSubmitButtons}
        aria-label="선호 챔피언 저장"
        aria-busy={busy}
        class="flex min-w-0 flex-col gap-5"
    >
        <input type="hidden" name="position" value={position} />
        {#each selected as championId (championId)}<input
                type="hidden"
                name="championIds"
                value={championId}
            />{/each}
        <fieldset disabled={locked} class="min-w-0">
            <legend class="sr-only">선호 포지션</legend>
            <SelectionTabs
                labels={POSITIONS.map(({ text }) => ({ text }))}
                {active}
                showNum={5}
                onclickTab={choosePosition}
            />
        </fieldset>
        <fieldset disabled={locked} class="min-w-0">
            <legend class="sr-only">챔피언 검색 및 추가</legend>
            <search aria-label="선호 챔피언 검색" class="flex min-w-0 flex-col gap-3">
                <div {@attach inputLabel('챔피언 검색')} {@attach searchInput}>
                    <Input
                        type="search"
                        title="챔피언 검색"
                        placeholder="한글 또는 영문 이름"
                        bind:value={query}
                        disabled={locked || !value.catalog.length}
                    />
                </div>
                {#if value.catalog.length}
                    <ul aria-label="추가할 챔피언" class="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {#each results.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE) as champion (champion.championId)}
                            <li class="min-w-0">
                                <Button
                                    type="button"
                                    fill="lineLight"
                                    size="full"
                                    heightOut="0"
                                    heightIn="2"
                                    injClass="min-h-12 justify-start gap-2 px-2 text-sm"
                                    disabled={locked || selected.length >= MAX_PREFERRED_CHAMPIONS}
                                    onclick={() => void add(champion.championId)}
                                >
                                    {#if champion.iconUrl}<img
                                            src={champion.iconUrl}
                                            alt=""
                                            width="28"
                                            height="28"
                                            loading="lazy"
                                            class="size-7 shrink-0 rounded-(--radius-small)"
                                        />{/if}
                                    <span class="min-w-0 text-left wrap-anywhere"
                                        >{champion.name}<span class="sr-only"> 추가</span></span
                                    >
                                </Button>
                            </li>
                        {:else}
                            <li class="col-span-full py-3 text-sm text-text-muted">
                                {query.trim()
                                    ? '일치하는 미선택 챔피언이 없어요.'
                                    : '추가할 챔피언이 없어요.'}
                            </li>
                        {/each}
                    </ul>
                    <PageNav
                        total={results.length}
                        pageSize={PAGE_SIZE}
                        {current}
                        onchange={(next) => {
                            if (!locked) current = next;
                        }}
                        label="챔피언 검색 결과 쪽 이동"
                    />
                {/if}
            </search>
        </fieldset>
        <div class="flex flex-col gap-3">
            <div class="flex items-baseline justify-between gap-3">
                <h3 class="font-semibold">{positionName} 선택 순서</h3>
                <span class="text-sm text-text-muted tabular-nums"
                    >{selected.length} / {MAX_PREFERRED_CHAMPIONS}</span
                >
            </div>
            <ol aria-label={`${positionName} 선택한 챔피언`} class="flex flex-col divide-y divide-border">
                {#each selected as championId, index (championId)}
                    <li
                        data-champion-id={championId}
                        class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 py-2"
                    >
                        <span class="w-5 shrink-0 text-center text-sm text-text-muted tabular-nums"
                            >{index + 1}</span
                        >
                        {#if catalog.get(championId)?.iconUrl}<img
                                src={catalog.get(championId)!.iconUrl!}
                                alt=""
                                width="28"
                                height="28"
                                loading="lazy"
                                class="size-7 shrink-0 rounded-(--radius-small)"
                            />{/if}
                        <span class="min-w-16 flex-1 text-sm font-medium wrap-anywhere"
                            >{name(championId)}</span
                        >
                        <div class="flex shrink-0 gap-1">
                            <Button
                                type="button"
                                fill="text"
                                size="auto"
                                heightOut="0"
                                heightIn="1"
                                injClass="min-h-11 min-w-11 px-2 text-sm"
                                disabled={locked || index === 0}
                                onclick={() => void move(championId, -1)}
                                ><span class="sr-only">{name(championId)} </span>위로</Button
                            >
                            <Button
                                type="button"
                                fill="text"
                                size="auto"
                                heightOut="0"
                                heightIn="1"
                                injClass="min-h-11 min-w-11 px-2 text-sm"
                                disabled={locked || index === selected.length - 1}
                                onclick={() => void move(championId, 1)}
                                ><span class="sr-only">{name(championId)} </span>아래로</Button
                            >
                            <Button
                                type="button"
                                fill="text"
                                size="auto"
                                heightOut="0"
                                heightIn="1"
                                injClass="min-h-11 min-w-11 px-2 text-sm"
                                disabled={locked}
                                onclick={() => void remove(championId, index)}
                                ><span class="sr-only">{name(championId)} </span>제거</Button
                            >
                        </div>
                    </li>
                {:else}
                    <li class="py-3 text-sm text-text-muted">
                        {value.catalogError
                            ? '선택한 챔피언이 없어요.'
                            : '아직 선택하지 않았어요. 검색 목록에서 챔피언을 추가해 주세요.'}
                    </li>
                {/each}
            </ol>
        </div>
        <p role="status" class="sr-only">{orderNotice}</p>
        {#if displayError}<p role="alert" class="text-sm text-error">{displayError}</p>{/if}
        {#if notice}<p role="status" class="text-sm text-success">{notice}</p>{/if}
        {#if value.catalogError || refreshRequired}
            <Button
                type="button"
                fill="lineLight"
                size="full"
                heightOut="0"
                heightIn="2"
                injClass="min-h-12 text-base"
                disabled={busy || reloading}
                loading={reloading ? {} : null}
                onclick={() => void reload()}>목록 다시 불러오기</Button
            >
        {/if}
        <Button
            type="submit"
            size="full"
            heightOut="0"
            heightIn="2"
            injClass="min-h-12 text-base"
            disabled={locked || !dirty || (Boolean(value.catalogError) && selected.length > 0)}
            loading={busy ? {} : null}>{positionName} 선호 챔피언 저장</Button
        >
    </form>
</section>
