<script lang="ts">
    import { tick, untrack } from 'svelte';
    import { enhance, type SubmitFunction } from '$app/forms';
    import { invalidateAll } from '$app/navigation';
    import { page } from '$app/state';
    import Button from '#lib/components/common/Button.svelte';
    import Dialog from '#lib/components/common/Dialog.svelte';
    import SwitchCell from '#lib/components/common/SwitchCell.svelte';
    import TextField from '#lib/components/common/TextField.svelte';
    import DateField from '#lib/components/common/DateField.svelte';
    import {
        playCapacity,
        RESERVE_CAPACITY,
        splitSchedule,
        TEAM_COUNT,
        TITLE_MAX,
        validateScrimSettings,
        writeScrimSettingsForm,
        type ScrimSettingsErrors,
        type ScrimSettingsInput
    } from '#lib/features/scrims/settings.ts';
    import type { ScrimSettings, ScrimSettingsField } from '#lib/features/scrims/types.ts';
    import { confirm } from '#lib/ui/confirm.ts';
    import { preventComposingSubmit } from '#lib/ui/form.ts';

    type Props = {
        open: boolean;
        title: string;
        submitText: string;
        // 현재 페이지의 form action 이름이다. 예: create, settings
        action: string;
        initial: ScrimSettings;
        editable: ScrimSettingsField[];
        // 저장에 성공하면 action이 돌려준 값과 함께 부른다. 팝업은 부른 뒤 닫힌다.
        onsaved: (data: Record<string, unknown> | undefined) => void | Promise<void>;
    };

    let { open = $bindable(false), title, submitText, action, initial, editable, onsaved }: Props = $props();

    const LOCKED_LABELS: Partial<Record<ScrimSettingsField, string>> = {
        teamCount: '팀 수',
        reserveCapacity: '추가 신청 정원',
        hardFearless: '하드 피어리스'
    };

    function fromSettings(settings: ScrimSettings): ScrimSettingsInput {
        return { ...settings, ...splitSchedule(settings.scheduledAt) };
    }

    let input = $state<ScrimSettingsInput>(untrack(() => fromSettings(initial)));
    let errors = $state<ScrimSettingsErrors>({});
    let formError = $state('');
    let pending = $state(false);
    let refreshRequired = $state(false);
    let form = $state<HTMLFormElement>();
    let requestId = $state('');
    let expectedRevision = $state<number>();

    // 열 때마다 저장된 값에서 다시 시작한다.
    $effect(() => {
        if (!open) return;
        untrack(() => {
            requestId = crypto.randomUUID();
            expectedRevision = page.data.scrim?.revision;
            input = fromSettings(initial);
            errors = {};
            formError = '';
            refreshRequired = false;
        });
    });

    const can = (field: ScrimSettingsField) => editable.includes(field);
    const locked = $derived(
        Object.entries(LOCKED_LABELS)
            .filter(([field]) => !can(field as ScrimSettingsField))
            .map(([, label]) => label)
    );
    const capacityLine = $derived(
        `실출전 ${playCapacity(input.teamCount)}명 · 최대 신청 ${playCapacity(input.teamCount) + input.reserveCapacity}명`
    );
    const dirty = $derived(JSON.stringify(input) !== JSON.stringify(fromSettings(initial)));

    async function close() {
        if (pending) return;
        if (dirty && !(await confirm('작성 중인 내용이 사라져요. 닫을까요?', title))) return;
        open = false;
    }

    // 네이티브 dialog가 Escape를 닫기 요청으로 바꾸기 전에 확인 절차를 거친다.
    function escape(event: KeyboardEvent) {
        if (!open || event.key !== 'Escape' || event.defaultPrevented) return;
        // 날짜·시각 입력의 브라우저 선택창은 Escape로 먼저 닫히게 둔다.
        const target = event.target;
        if (target instanceof HTMLInputElement && ['date', 'time', 'datetime-local'].includes(target.type))
            return;
        event.preventDefault();
        void close();
    }

    async function focusFirstError() {
        await tick();
        const field = (['title', 'date', 'time'] as const).find((key) => errors[key]);
        form?.querySelector<HTMLInputElement>(`[data-field="${field}"] input`)?.focus();
    }

    const submit: SubmitFunction = ({ formData, cancel }) => {
        if (pending || refreshRequired) {
            cancel();
            return;
        }
        errors = validateScrimSettings(input);
        formError = '';
        if (Object.keys(errors).length) {
            cancel();
            void focusFirstError();
            return;
        }
        writeScrimSettingsForm(formData, input);
        formData.set('requestId', requestId);
        if (expectedRevision !== undefined) formData.set('expectedRevision', String(expectedRevision));
        pending = true;
        return async ({ result }) => {
            try {
                if (result.type === 'success') {
                    await onsaved(result.data);
                    open = false;
                } else if (result.type === 'failure') {
                    errors = (result.data?.errors as ScrimSettingsErrors) ?? {};
                    formError = String(result.data?.message ?? '');
                    if (!Object.keys(errors).length && !formError) formError = '저장하지 못했어요';
                    if (result.status === 409) await invalidateAll();
                } else {
                    formError =
                        '요청 결과를 확인하지 못했어요. 연결을 확인한 뒤 새로고침해 반영 여부를 확인해 주세요.';
                }
            } catch {
                refreshRequired = result.type === 'success';
                formError = refreshRequired
                    ? '저장했지만 화면을 갱신하지 못했어요. 창을 닫고 새로고침해 주세요.'
                    : '최신 상태를 불러오지 못했어요. 새로고침해 현재 상태를 확인해 주세요.';
            } finally {
                pending = false;
                if (Object.keys(errors).length) void focusFirstError();
            }
        };
    };
</script>

{#snippet counter(
    label: string,
    value: number,
    range: { min: number; max: number },
    apply: (next: number) => void
)}
    <fieldset class="min-w-0 border-0 p-0">
        <legend class="mb-1.5 text-xs font-semibold text-muted">{label}</legend>
        <div
            class="inline-flex max-w-full items-center overflow-hidden rounded-form border border-line-strong bg-surface-2"
        >
            <button
                type="button"
                class="grid size-9 place-items-center text-base hover:bg-surface-hover focus-visible:-outline-offset-2 disabled:opacity-45 pointer-coarse:size-11"
                aria-label={`${label} 줄이기`}
                disabled={value <= range.min}
                onclick={() => apply(value - 1)}>−</button
            >
            <output class="min-w-7 border-x border-line text-center text-sm font-bold">{value}</output>
            <button
                type="button"
                class="grid size-9 place-items-center text-base hover:bg-surface-hover focus-visible:-outline-offset-2 disabled:opacity-45 pointer-coarse:size-11"
                aria-label={`${label} 늘리기`}
                disabled={value >= range.max}
                onclick={() => apply(value + 1)}>+</button
            >
        </div>
    </fieldset>
{/snippet}

<!-- 폼이 dialog를 감싸므로 footer 버튼도 같은 제출에 속한다. 닫기는 확인 절차를 거친 뒤에만 일어난다. -->
<svelte:window onkeydown={escape} />
<form
    bind:this={form}
    method="POST"
    action={`?/${action}`}
    novalidate
    aria-busy={pending}
    use:enhance={submit}
    {@attach preventComposingSubmit}
>
    <Dialog bind:open {title} dismissible={false}>
        <fieldset disabled={pending || refreshRequired} class="flex min-w-0 flex-col gap-4 border-0 p-0">
            <div data-field="title">
                <TextField
                    label="제목"
                    placeholder="예: 10월 정기 내전"
                    bind:value={input.title}
                    maxlength={TITLE_MAX}
                    error={errors.title}
                    required
                />
            </div>

            {#if can('scheduledAt')}
                <div class="flex flex-col gap-1.5">
                    <div class="grid grid-cols-[repeat(auto-fit,minmax(min(100%,8.5rem),1fr))] gap-3">
                        <div data-field="date" class="min-w-0 [&_input]:min-w-0">
                            <DateField label="날짜" bind:value={input.date} error={errors.date} />
                        </div>
                        <div data-field="time" class="min-w-0 [&_input]:min-w-0">
                            <TextField label="시각" type="time" bind:value={input.time} error={errors.time} />
                        </div>
                    </div>
                    <p class="text-xs text-muted">날짜와 시각을 모두 비우면 일정 미정이에요.</p>
                </div>
            {/if}

            {#if can('teamCount') || can('reserveCapacity')}
                <div class="flex flex-col gap-2.5 border-t border-line pt-3">
                    <div class="grid grid-cols-[repeat(auto-fit,minmax(min(100%,7.5rem),1fr))] gap-3">
                        {@render counter(
                            '팀 수',
                            input.teamCount,
                            TEAM_COUNT,
                            (next) => (input.teamCount = next)
                        )}
                        {@render counter(
                            '추가 신청 정원',
                            input.reserveCapacity,
                            RESERVE_CAPACITY,
                            (next) => (input.reserveCapacity = next)
                        )}
                    </div>
                    <p class="text-ui font-medium text-ink-2" aria-live="polite">{capacityLine}</p>
                </div>
            {/if}

            {#if can('hardFearless')}
                <div class="border-y border-line">
                    <SwitchCell title="하드 피어리스" bind:active={input.hardFearless} />
                </div>
            {/if}

            {#if locked.length}
                <p class="text-sm text-muted">이 단계에서 바꿀 수 없는 설정: {locked.join(' · ')}</p>
            {/if}
        </fieldset>

        {#snippet footer()}
            <div class="flex flex-col gap-3">
                {#if formError}
                    <p role="alert" class="text-sm text-error">{formError}</p>
                {/if}
                <div class="flex flex-wrap justify-end gap-2">
                    <Button variant="secondary" type="button" disabled={pending} onclick={close}>취소</Button>
                    <Button
                        variant="primary"
                        type="submit"
                        loading={pending}
                        disabled={pending || refreshRequired}
                    >
                        {submitText}
                    </Button>
                </div>
            </div>
        {/snippet}
    </Dialog>
</form>
