<script lang="ts">
	import { untrack } from 'svelte';
	import { Button, Calendar, Input, Popup, Radio, Stepper } from 'stdf';
	import { enhance, type SubmitFunction } from '$app/forms';
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
	import type { FormationMethod, ScrimSettings, ScrimSettingsField } from '#lib/features/scrims/types.ts';
	import { confirm } from '#lib/ui/confirm.ts';
	import { nonSubmitButtons } from '#lib/ui/form.ts';
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

	const METHODS = [
		{ name: 'none', label: '미정' },
		{ name: 'manual', label: '수동' },
		{ name: 'auction', label: '경매' }
	];
	const LOCKED_LABELS: Partial<Record<ScrimSettingsField, string>> = {
		teamCount: '팀 수',
		reserveCapacity: '추가 신청 정원',
		formationMethod: '편성 방식',
		hardFearless: '하드 피어리스'
	};

	function fromSettings(settings: ScrimSettings): ScrimSettingsInput {
		return { ...settings, ...splitSchedule(settings.scheduledAt) };
	}

	let input = $state<ScrimSettingsInput>(untrack(() => fromSettings(initial)));
	let errors = $state<ScrimSettingsErrors>({});
	let formError = $state('');
	let pending = $state(false);
	let calendarOpen = $state(false);
	let form = $state<HTMLFormElement>();

	// 열 때마다 저장된 값에서 다시 시작한다.
	$effect(() => {
		if (!open) return;
		untrack(() => {
			input = fromSettings(initial);
			errors = {};
			formError = '';
			calendarOpen = false;
		});
	});

	const can = (field: ScrimSettingsField) => editable.includes(field);
	const locked = $derived(
		Object.entries(LOCKED_LABELS)
			.filter(([field]) => !can(field as ScrimSettingsField))
			.map(([, label]) => label)
	);
	const method = $derived(input.formationMethod ?? 'none');
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

	async function close() {
		if (pending) return;
		if (dirty && !(await confirm('작성 중인 내용이 사라져요. 닫을까요?', title))) return;
		open = false;
	}

	function focusFirstError() {
		const field = (['title', 'date', 'time'] as const).find((key) => errors[key]);
		form?.querySelector<HTMLInputElement>(`[data-field="${field}"] input`)?.focus();
	}

	const submit: SubmitFunction = ({ formData, cancel }) => {
		errors = validateScrimSettings(input);
		formError = '';
		if (Object.keys(errors).length) {
			cancel();
			focusFirstError();
			return;
		}
		writeScrimSettingsForm(formData, input);
		pending = true;
		return async ({ result }) => {
			pending = false;
			if (result.type === 'success') {
				await onsaved(result.data);
				open = false;
			} else if (result.type === 'failure') {
				errors = (result.data?.errors as ScrimSettingsErrors) ?? {};
				formError = String(result.data?.message ?? '');
				if (Object.keys(errors).length) focusFirstError();
				else if (!formError) formError = '저장하지 못했어요';
			} else {
				formError = '저장하지 못했어요';
			}
		};
	};
</script>

<div {@attach overlay({ open, label: title, onclose: close })}>
	<Popup bind:visible={open} position={desktop.current ? 'center' : 'bottom'} size={0} maskClosable={false} transparent>
		<form
			bind:this={form}
			method="POST"
			action={`?/${action}`}
			novalidate
			use:enhance={submit}
			{@attach nonSubmitButtons}
			class="mx-auto flex max-h-[90dvh] w-full max-w-lg flex-col rounded-t-(--radius-box) bg-bg-surface lg:rounded-(--radius-box) dark:bg-bg-surface-dark"
		>
			<h2 class="px-6 pt-6 pb-4 text-lg font-semibold">{title}</h2>

			<!-- 내용이 길면 이 영역만 스크롤하고 하단 버튼은 항상 보이게 둔다. -->
			<div class="flex min-h-0 flex-col gap-5 overflow-y-auto px-6 pb-2">
				<div data-field="title">
					<Input
						title="제목"
						titlePosition="out"
						placeholder="예: 10월 정기 내전"
						bind:value={input.title}
						maxlength={TITLE_MAX}
						state={errors.title ? 'error' : 'theme'}
						tip={errors.title}
						required
					/>
				</div>

				{#if can('scheduledAt')}
					<div class="flex flex-col gap-2">
						<div class="grid grid-cols-2 gap-3">
							<div data-field="date">
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
									tip={errors.date}
								/>
							</div>
							<div data-field="time">
								<Input
									title="시각"
									titlePosition="out"
									placeholder="20:00"
									inputmode="numeric"
									maxlength={5}
									bind:value={input.time}
									state={errors.time ? 'error' : 'theme'}
									tip={errors.time}
								/>
							</div>
						</div>
						{#if calendarOpen}
							<!-- 팝업 안에서 또 다른 팝업을 열지 않도록 달력을 입력 아래에 펼친다. 날짜를 고르면 접힌다. -->
							<div class="rounded-(--radius-form) border border-border">
								<Calendar
									popup={null}
									mode="single"
									height={320}
									startMonth={monthKey(0)}
									endMonth={monthKey(6)}
									initSelectedDates={input.date ? [input.date.replaceAll('-', '')] : []}
									outFormat="YYYY-MM-DD"
									onconfirm={(dates) => {
										input.date = dates[0] ?? '';
										calendarOpen = false;
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
							<fieldset class="flex flex-col gap-2">
								<legend class="mb-2 text-sm font-medium">팀 수</legend>
								<Stepper bind:value={input.teamCount} min={TEAM_COUNT.min} max={TEAM_COUNT.max} step={1} />
							</fieldset>
							<fieldset class="flex flex-col gap-2">
								<legend class="mb-2 text-sm font-medium">추가 신청 정원</legend>
								<Stepper
									bind:value={input.reserveCapacity}
									min={RESERVE_CAPACITY.min}
									max={RESERVE_CAPACITY.max}
									step={1}
								/>
							</fieldset>
						</div>
						<p class="text-sm opacity-70" aria-live="polite">{capacityLine}</p>
					</div>
				{/if}

				{#if can('formationMethod')}
					<fieldset class="flex flex-col gap-2">
						<legend class="mb-2 text-sm font-medium">편성 방식</legend>
						<Radio
							data={METHODS}
							value={method}
							layout="h"
							onchange={(value) => (input.formationMethod = value === 'none' ? null : (value as FormationMethod))}
						/>
					</fieldset>
				{/if}

				{#if can('hardFearless')}
					<div class="overflow-hidden rounded-(--radius-box) border border-border">
						<SwitchCell title="하드 피어리스" bind:active={input.hardFearless} />
					</div>
				{/if}

				{#if locked.length}
					<p class="text-sm opacity-70">이 단계에서 바꿀 수 없는 설정: {locked.join(' · ')}</p>
				{/if}
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
					>
						{submitText}
					</Button>
				</div>
			</div>
		</form>
	</Popup>
</div>
