<script lang="ts">
    import { tick, untrack } from 'svelte';
    import type { Attachment } from 'svelte/attachments';
    import { Button, Calendar, Input, Popup, Stepper } from 'stdf';
    import { enhance, type SubmitFunction } from '$app/forms';
    import { invalidateAll } from '$app/navigation';
    import { page } from '$app/state';
    import SwitchCell from '#lib/components/common/SwitchCell.svelte';
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
    import { inputFeedback, inputLabel, nonSubmitButtons, stepperLabels } from '#lib/ui/form.ts';
    import { overlay } from '#lib/ui/overlay.ts';
    import { desktop } from '#lib/ui/viewport.svelte.ts';

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
    let calendarOpen = $state(false);
    let form = $state<HTMLFormElement>();
    let requestId = $state('');
    let expectedRevision = $state<number>();
    let popupPosition = $state<'center' | 'bottom'>('bottom');
    const id = $props.id();

    $effect(() => {
        // 열린 입력창은 위치 전환으로 이전·새 입력이 동시에 생기지 않도록 유지한다.
        if (!open) popupPosition = desktop.current ? 'center' : 'bottom';
    });

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
            calendarOpen = false;
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

    // 달력은 YYYYMMDD 대신 입력값과 같은 YYYY-MM-DD로 받는다.
    const today = new Date();
    const monthKey = (offset: number) => {
        const date = new Date(today.getFullYear(), today.getMonth() + offset, 1);
        return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
    };

    // STDF 3은 날짜별 접근성 속성을 받지 않아, 기존 달력의 빈 칸과 날짜 이름만 보완한다.
    const calendarAccessibility: Attachment<HTMLDivElement> = (node) => {
        const apply = () => {
            for (const grid of node.querySelectorAll<HTMLElement>('.grid-cols-7')) {
                const title = grid.previousElementSibling;
                const month = title?.textContent?.match(/(\d{1,2})\s*월\s*(\d{4})/);
                title?.classList.add('!text-text-muted');
                for (const button of grid.querySelectorAll<HTMLButtonElement>(':scope > button')) {
                    const day = button.firstElementChild?.firstElementChild?.textContent?.trim();
                    if (!day) {
                        button.disabled = true;
                        button.setAttribute('aria-hidden', 'true');
                    } else if (month) {
                        button.setAttribute('aria-label', `${month[2]}년 ${Number(month[1])}월 ${day}일`);
                        button.setAttribute(
                            'aria-pressed',
                            String(
                                input.date ===
                                    `${month[2]}-${month[1].padStart(2, '0')}-${day.padStart(2, '0')}`
                            )
                        );
                    }
                }
            }
        };
        apply();
        const observer = new MutationObserver(apply);
        observer.observe(node, { childList: true, characterData: true, subtree: true });
        return () => observer.disconnect();
    };

    async function close() {
        if (pending) return;
        if (dirty && !(await confirm('작성 중인 내용이 사라져요. 닫을까요?', title))) return;
        open = false;
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

<div {@attach overlay({ open, label: title, onclose: close })}>
    <Popup bind:visible={open} position={popupPosition} size={0} maskClosable={false} transparent>
        <form
            bind:this={form}
            method="POST"
            action={`?/${action}`}
            novalidate
            aria-busy={pending}
            use:enhance={submit}
            {@attach nonSubmitButtons}
            class="mx-auto flex max-h-[90dvh] w-full max-w-lg flex-col rounded-t-(--radius-box) bg-bg-surface lg:rounded-(--radius-box) dark:bg-bg-surface-dark"
        >
            <h2 class="px-6 pt-6 pb-4 text-lg font-semibold">{title}</h2>

            <!-- 내용이 길면 이 영역만 스크롤하고 하단 버튼은 항상 보이게 둔다. -->
            <div class="min-h-0 overflow-y-auto px-6 pb-2">
                <fieldset disabled={pending || refreshRequired} class="flex min-w-0 flex-col gap-5">
                    <div data-field="title" {@attach inputFeedback(errors.title, `${id}-title-error`)}>
                        <Input
                            title="제목"
                            titlePosition="out"
                            placeholder="예: 10월 정기 내전"
                            bind:value={input.title}
                            maxlength={TITLE_MAX}
                            state={errors.title ? 'error' : 'theme'}
                            required
                        />
                        {#if errors.title}<p
                                id={`${id}-title-error`}
                                role="alert"
                                class="mt-1 text-sm text-error"
                            >
                                {errors.title}
                            </p>{/if}
                    </div>

                    {#if can('scheduledAt')}
                        <div class="flex flex-col gap-2">
                            <div class="grid grid-cols-2 gap-3">
                                <div
                                    data-field="date"
                                    {@attach inputLabel('날짜')}
                                    {@attach inputFeedback(errors.date, `${id}-date-error`)}
                                >
                                    <Input
                                        title="날짜"
                                        titlePosition="out"
                                        placeholder="날짜 선택"
                                        value={input.date}
                                        readonly
                                        clear
                                        onfocus={() => (calendarOpen = true)}
                                        onclear={() => ((input.date = ''), (calendarOpen = false))}
                                        state={errors.date ? 'error' : 'theme'}
                                    />
                                    {#if errors.date}<p
                                            id={`${id}-date-error`}
                                            role="alert"
                                            class="mt-1 text-sm text-error"
                                        >
                                            {errors.date}
                                        </p>{/if}
                                </div>
                                <div
                                    data-field="time"
                                    {@attach inputFeedback(errors.time, `${id}-time-error`)}
                                >
                                    <Input
                                        title="시각"
                                        titlePosition="out"
                                        placeholder="20:00"
                                        inputmode="text"
                                        maxlength={5}
                                        bind:value={input.time}
                                        state={errors.time ? 'error' : 'theme'}
                                    />
                                    {#if errors.time}<p
                                            id={`${id}-time-error`}
                                            role="alert"
                                            class="mt-1 text-sm text-error"
                                        >
                                            {errors.time}
                                        </p>{/if}
                                </div>
                            </div>
                            {#if calendarOpen}
                                <!-- 팝업 안에서 또 다른 팝업을 열지 않도록 달력을 입력 아래에 펼친다. 날짜를 고르면 접힌다. -->
                                <div
                                    class="rounded-(--radius-form) border border-border"
                                    {@attach calendarAccessibility}
                                >
                                    <Calendar
                                        popup={null}
                                        mode="single"
                                        height={32}
                                        startMonth={monthKey(0)}
                                        endMonth={monthKey(6)}
                                        initSelectedDates={input.date ? [input.date.replaceAll('-', '')] : []}
                                        outFormat="YYYY-MM-DD"
                                        onconfirm={async (dates) => {
                                            input.date = dates[0] ?? '';
                                            calendarOpen = false;
                                            await tick();
                                            form?.querySelector<HTMLInputElement>(
                                                '[data-field="time"] input'
                                            )?.focus();
                                        }}
                                    />
                                </div>
                            {/if}
                            <p class="text-xs opacity-70">날짜와 시각을 모두 비우면 일정 미정이에요.</p>
                        </div>
                    {/if}

                    {#if can('teamCount') || can('reserveCapacity')}
                        <div class="flex flex-col gap-2">
                            <div class="grid grid-cols-2 gap-3">
                                <fieldset class="flex flex-col gap-2" {@attach stepperLabels('팀 수')}>
                                    <legend class="mb-2 text-sm font-medium">팀 수</legend>
                                    <Stepper
                                        bind:value={input.teamCount}
                                        min={TEAM_COUNT.min}
                                        max={TEAM_COUNT.max}
                                        step={1}
                                        injClassBtn="min-h-11 min-w-11"
                                    />
                                </fieldset>
                                <fieldset
                                    class="flex flex-col gap-2"
                                    {@attach stepperLabels('추가 신청 정원')}
                                >
                                    <legend class="mb-2 text-sm font-medium">추가 신청 정원</legend>
                                    <Stepper
                                        bind:value={input.reserveCapacity}
                                        min={RESERVE_CAPACITY.min}
                                        max={RESERVE_CAPACITY.max}
                                        step={1}
                                        injClassBtn="min-h-11 min-w-11"
                                    />
                                </fieldset>
                            </div>
                            <p class="text-sm opacity-70" aria-live="polite">{capacityLine}</p>
                        </div>
                    {/if}

                    {#if can('hardFearless')}
                        <div class="overflow-hidden rounded-(--radius-box) border border-border">
                            <SwitchCell title="하드 피어리스" bind:active={input.hardFearless} />
                        </div>
                    {/if}

                    {#if locked.length}
                        <p class="text-sm opacity-70">이 단계에서 바꿀 수 없는 설정: {locked.join(' · ')}</p>
                    {/if}
                </fieldset>
            </div>

            <div class="flex flex-col gap-3 px-6 pt-4 pb-6">
                {#if formError}
                    <p role="alert" class="text-sm text-error">{formError}</p>
                {/if}
                <div class="flex flex-col-reverse gap-2 lg:flex-row lg:justify-end">
                    <Button
                        type="button"
                        fill="lineLight"
                        size={desktop.current ? 'auto' : 'full'}
                        heightOut="0"
                        injClass="px-4"
                        disabled={pending}
                        onclick={close}
                    >
                        취소
                    </Button>
                    <Button
                        type="submit"
                        size={desktop.current ? 'auto' : 'full'}
                        heightOut="0"
                        injClass="px-4"
                        loading={pending ? {} : null}
                        disabled={pending || refreshRequired}
                    >
                        {submitText}
                    </Button>
                </div>
            </div>
        </form>
    </Popup>
</div>
