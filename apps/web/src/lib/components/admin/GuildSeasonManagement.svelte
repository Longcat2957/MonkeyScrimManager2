<script lang="ts">
    import { tick, untrack } from 'svelte';
    import { enhance, type SubmitFunction } from '$app/forms';
    import { invalidate } from '$app/navigation';
    import { navigating } from '$app/state';
    import { Button, Input } from 'stdf';
    import type { GuildSeasonOverview } from '#lib/features/seasons.ts';
    import { confirm } from '#lib/ui/confirm.ts';
    import { inputFeedback, inputLabel, nonSubmitButtons } from '#lib/ui/form.ts';

    type Props = { overview: GuildSeasonOverview; initialName?: string; initialError?: string };
    let { overview, initialName = '', initialError = '' }: Props = $props();
    const id = $props.id();
    let name = $state(untrack(() => initialName));
    let error = $state(untrack(() => initialError));
    let inputError = $state('');
    let notice = $state('');
    let confirming = $state(false);
    let busy = $state(false);
    let refreshRequired = $state(false);
    let form: HTMLFormElement;
    const locked = $derived(busy || Boolean(navigating.to) || refreshRequired);
    const date = new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul',
        dateStyle: 'medium',
        timeStyle: 'short'
    });

    async function focusName() {
        await tick();
        form?.querySelector<HTMLInputElement>('input:not([type="hidden"])')?.focus();
    }

    const submit: SubmitFunction = async ({ cancel, formData }) => {
        if (locked || confirming || !overview.current) {
            cancel();
            return;
        }
        error = '';
        notice = '';
        inputError = '';
        const nextName = name.trim();
        if (!nextName || nextName.length > 100) {
            inputError = '새 시즌 이름은 1~100자로 입력해 주세요.';
            cancel();
            void focusName();
            return;
        }
        // 사용자가 확인한 이전 시즌을 보존해 확인창 도중 다른 운영자가 전환해도 덮지 않는다.
        const previous = overview.current;
        confirming = true;
        let agreed = false;
        try {
            agreed = await confirm(
                `‘${previous.name}’을 종료하고 ‘${nextName}’을 시작할까요?`,
                '새 시즌 시작'
            );
        } catch {
            error = '확인창을 열지 못했어요. 다시 시도해 주세요.';
        } finally {
            confirming = false;
        }
        if (!agreed) {
            cancel();
            return;
        }
        busy = true;
        formData.set('name', nextName);
        formData.set('expectedCurrentSeasonId', previous.id);
        return async ({ result, update }) => {
            try {
                if (result.type === 'success') {
                    await update({ reset: false });
                    name = '';
                    notice = '새 시즌을 시작했어요.';
                    void focusName();
                } else if (result.type === 'failure') {
                    const message = String(
                        result.data?.message ?? '시즌을 전환하지 못했어요. 다시 시도해 주세요.'
                    );
                    if (result.status === 400) {
                        inputError = message;
                        void focusName();
                    } else error = message;
                    if (result.status === 409) await invalidate('app:guild-seasons');
                } else {
                    refreshRequired = true;
                    error = '요청 결과를 확인하지 못했어요. 새로고침해 현재 시즌을 확인해 주세요.';
                }
            } catch {
                refreshRequired = true;
                error =
                    result.type === 'success'
                        ? '시즌은 전환했지만 화면을 갱신하지 못했어요. 새로고침해 현재 시즌을 확인해 주세요.'
                        : '현재 시즌을 다시 불러오지 못했어요. 새로고침한 뒤 다시 확인해 주세요.';
            } finally {
                busy = false;
            }
        };
    };
</script>

<div class="flex min-w-0 flex-col gap-8">
    <section aria-labelledby={`${id}-current`} class="flex min-w-0 flex-col gap-3">
        <h2 id={`${id}-current`} class="text-lg font-semibold">현재 시즌</h2>
        {#if overview.current}
            <p class="text-xl font-semibold wrap-anywhere">{overview.current.name}</p>
            <p class="text-sm text-text-muted">
                시작 <time datetime={overview.current.startedAt}
                    >{date.format(new Date(overview.current.startedAt))}</time
                >
            </p>
        {:else}
            <p class="text-sm leading-6 text-text-muted">
                진행 중인 시즌이 없어요. Discord에서 서버 초기 설정을 확인해 주세요.
            </p>
        {/if}
    </section>

    <form
        bind:this={form}
        method="POST"
        action="?tab=seasons&/rotateSeason"
        use:enhance={submit}
        {@attach nonSubmitButtons}
        aria-labelledby={`${id}-rotate`}
        aria-busy={busy}
        class="flex flex-col gap-4"
    >
        <h2 id={`${id}-rotate`} class="text-lg font-semibold">시즌 전환</h2>
        <input type="hidden" name="name" value={name} />
        <input type="hidden" name="expectedCurrentSeasonId" value={overview.current?.id ?? ''} />
        <input type="hidden" name="confirm" value="true" />
        <div
            class="-mx-2 -my-1"
            {@attach inputLabel('새 시즌 이름')}
            {@attach inputFeedback(inputError, `${id}-name-error`)}
        >
            <Input
                title="새 시즌 이름"
                placeholder="예: 2027 시즌 1"
                bind:value={name}
                maxlength={100}
                disabled={locked || !overview.current}
            />
        </div>
        <p class="text-sm leading-6 text-text-muted">
            기존 내전·MMR 이력은 유지해요. 새 내전부터 새 시즌에 기록하고, 새 시즌 MMR은 1500에서 시작해요.
        </p>
        {#if inputError}<p id={`${id}-name-error`} role="alert" class="text-sm text-error">
                {inputError}
            </p>{/if}
        {#if error}<p role="alert" class="text-sm text-error">{error}</p>{/if}
        {#if notice}<p role="status" class="text-sm text-success">{notice}</p>{/if}
        <div>
            <Button
                type="submit"
                size="auto"
                heightOut="0"
                heightIn="2"
                injClass="min-h-12 px-4 text-base"
                disabled={locked || !overview.current}
                loading={busy ? {} : null}>새 시즌 시작</Button
            >
        </div>
    </form>

    <section aria-labelledby={`${id}-completed`} class="flex min-w-0 flex-col gap-3">
        <h2 id={`${id}-completed`} class="text-lg font-semibold">지난 시즌</h2>
        {#if overview.completed.length}
            <ol class="divide-y divide-border rounded-(--radius-box) bg-bg-surface dark:bg-bg-surface-dark">
                {#each overview.completed as season (season.id)}
                    <li class="flex min-w-0 flex-col gap-2 px-4 py-4">
                        <h3 class="font-semibold wrap-anywhere">{season.name}</h3>
                        <p class="text-sm text-text-muted">
                            <time datetime={season.startedAt}>{date.format(new Date(season.startedAt))}</time>
                            ~
                            {#if season.endedAt}<time datetime={season.endedAt}
                                    >{date.format(new Date(season.endedAt))}</time
                                >{/if}
                        </p>
                    </li>
                {/each}
            </ol>
        {:else}
            <p class="text-sm text-text-muted">아직 종료된 시즌이 없어요.</p>
        {/if}
    </section>
</div>
