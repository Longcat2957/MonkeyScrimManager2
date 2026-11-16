<script lang="ts">
    import { enhance, type SubmitFunction } from '$app/forms';
    import { navigating, page } from '$app/state';
    import { tick } from 'svelte';
    import { Button, Input } from 'stdf';
    import PageNav from '#lib/components/common/PageNav.svelte';
    import SectionState from '#lib/components/common/SectionState.svelte';
    import type { ServiceAdminOverview } from '#lib/features/service-admin.ts';
    import { confirm } from '#lib/ui/confirm.ts';
    import { inputFeedback, inputLabel, nonSubmitButtons } from '#lib/ui/form.ts';

    type Props = {
        overview: ServiceAdminOverview;
        currentUserId: string;
        currentPage: number;
        pageSize: number;
        actionError?: string;
        onpagechange: (page: number) => void | Promise<void>;
    };

    let { overview, currentUserId, currentPage, pageSize, actionError = '', onpagechange }: Props = $props();
    const id = $props.id();
    let grantForm = $state<HTMLFormElement>();
    let targetId = $state('');
    let busy = $state(false);
    let busyTarget = $state('');
    let granting = $state(false);
    let inputError = $state('');
    let error = $state('');
    let notice = $state('');
    let refreshRequired = $state(false);
    const moving = $derived(navigating.to?.route.id === '/backoffice');
    const locked = $derived(busy || moving || refreshRequired);
    const lastAdmin = $derived(overview.admins.length <= 1);
    const action = $derived(`?/setServiceAdmin${page.url.searchParams.get('mock') === '1' ? '&mock=1' : ''}`);
    const date = new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul',
        dateStyle: 'medium',
        timeStyle: 'short'
    });

    async function focusId() {
        await tick();
        grantForm?.querySelector<HTMLInputElement>('input:not([type="hidden"])')?.focus();
    }

    const submit: SubmitFunction = async ({ formData, submitter, cancel }) => {
        if (locked) {
            cancel();
            return;
        }
        const enabled = formData.get('enabled') === 'true';
        const userId = enabled ? targetId.trim() : String(formData.get('userId') ?? '');
        inputError = '';
        error = '';
        notice = '';
        if (enabled && !/^\d{17,20}$/.test(userId)) {
            inputError = 'Discord 사용자 ID를 17~20자리 숫자로 입력해 주세요.';
            cancel();
            void focusId();
            return;
        }
        const target = overview.admins.find((admin) => admin.userId === userId);
        const self = userId === currentUserId;
        const title = enabled ? '서비스 운영자 지정' : '서비스 운영자 권한 해제';
        const message = enabled
            ? `Discord 사용자 ${userId}에게 서비스 운영 권한을 부여할까요? 백오피스와 서비스 운영자를 관리할 수 있게 돼요.`
            : self
              ? '내 서비스 운영 권한을 해제할까요? 해제하면 백오피스 접근이 종료되고 내 정보로 이동해요.'
              : `${target?.displayName ?? '사용자'} (${userId})님의 서비스 운영 권한을 해제할까요? 백오피스에 접근할 수 없게 돼요.`;
        busy = true;
        busyTarget = userId;
        granting = enabled;
        try {
            if (!(await confirm(message, title))) {
                cancel();
                busy = false;
                busyTarget = '';
                await tick();
                submitter?.focus({ preventScroll: true });
                return;
            }
        } catch {
            cancel();
            busy = false;
            busyTarget = '';
            error = '확인창을 열지 못했어요. 다시 시도해 주세요.';
            await tick();
            submitter?.focus({ preventScroll: true });
            return;
        }
        formData.set('userId', userId);
        return async ({ result, update }) => {
            try {
                if (result.type === 'success') {
                    await update({ reset: false });
                    notice =
                        result.data?.changed === false
                            ? '이미 같은 권한 상태예요.'
                            : enabled
                              ? '서비스 운영자로 지정했어요.'
                              : '서비스 운영 권한을 해제했어요.';
                    if (enabled) {
                        targetId = '';
                    }
                    // 회수한 행이 사라져도 다음 조작의 입력으로 포커스를 이어 준다.
                    void focusId();
                } else if (result.type === 'redirect') {
                    // 자기 권한을 회수한 서버 응답의 이동을 그대로 따른다.
                    await update({ reset: false });
                } else if (result.type === 'failure') {
                    const message = String(result.data?.message ?? '권한을 변경하지 못했어요.');
                    if (enabled && (result.status === 400 || result.status === 404)) {
                        inputError = message;
                        void focusId();
                    } else error = message;
                } else {
                    refreshRequired = true;
                    error =
                        '요청 결과를 확인하지 못했어요. 연결을 확인한 뒤 새로고침해 현재 권한을 확인해 주세요.';
                }
            } catch {
                refreshRequired = true;
                error =
                    result.type === 'success'
                        ? '권한을 변경했지만 화면을 갱신하지 못했어요. 새로고침해 현재 권한을 확인해 주세요.'
                        : '최신 권한을 불러오지 못했어요. 새로고침해 현재 상태를 확인해 주세요.';
            } finally {
                busy = false;
                busyTarget = '';
            }
        };
    };
</script>

<section class="flex min-w-0 flex-col gap-5" aria-labelledby={`${id}-admins`} aria-busy={busy}>
    <h2 id={`${id}-admins`} class="text-lg font-semibold">서비스 운영자</h2>
    <ul role="list" class="divide-y divide-border rounded-(--radius-box) border border-border">
        {#each overview.admins as admin (admin.userId)}
            <li class="flex min-w-0 flex-wrap items-center justify-between gap-3 px-4 py-4">
                <div class="min-w-0 flex-1">
                    <p class="font-medium wrap-anywhere">
                        {admin.displayName}{admin.userId === currentUserId ? ' (나)' : ''}
                    </p>
                    {#if admin.userId}<p class="mt-1 text-sm text-text-muted tabular-nums wrap-anywhere">
                            {admin.userId}
                        </p>{/if}
                </div>
                <form
                    method="POST"
                    {action}
                    aria-label={`${admin.displayName} (${admin.userId}) 권한 관리`}
                    use:enhance={submit}
                >
                    <input type="hidden" name="userId" value={admin.userId ?? ''} />
                    <input type="hidden" name="enabled" value="false" />
                    <Button
                        type="submit"
                        fill="lineLight"
                        size="auto"
                        heightOut="0"
                        heightIn="2"
                        injClass="min-h-12 px-3 text-sm"
                        disabled={locked || lastAdmin || !admin.userId}
                        loading={busy && !granting && busyTarget === admin.userId ? {} : null}
                    >
                        권한 해제<span class="sr-only"> {admin.displayName} ({admin.userId})</span>
                    </Button>
                </form>
            </li>
        {/each}
    </ul>
    {#if lastAdmin}<p class="text-sm text-text-muted">마지막 서비스 운영자는 권한을 해제할 수 없어요.</p>{/if}

    <form
        bind:this={grantForm}
        method="POST"
        {action}
        aria-label="서비스 운영자 지정"
        novalidate
        use:enhance={submit}
        {@attach nonSubmitButtons}
        class="flex min-w-0 flex-col gap-3"
    >
        <input type="hidden" name="enabled" value="true" />
        <div {@attach inputLabel('Discord 사용자 ID')} {@attach inputFeedback(inputError, `${id}-id-error`)}>
            <Input
                title="Discord 사용자 ID"
                titlePosition="out"
                placeholder="예: 970000000000000001"
                type="text"
                inputmode="numeric"
                autocomplete={false}
                bind:value={targetId}
                maxlength={20}
                required
                disabled={locked}
                state={inputError ? 'error' : 'theme'}
                onchange={() => (inputError = '')}
            />
            {#if inputError}<p id={`${id}-id-error`} role="alert" class="mt-2 text-sm text-error">
                    {inputError}
                </p>{/if}
        </div>
        <div class="flex flex-wrap items-center justify-between gap-3">
            <p class="text-sm text-text-muted">이 서비스에 로그인한 사용자를 지정할 수 있어요.</p>
            <Button
                type="submit"
                size="auto"
                heightOut="0"
                heightIn="2"
                injClass="min-h-12 w-full px-4 text-base sm:w-auto"
                disabled={locked}
                loading={busy && granting ? {} : null}>운영자 지정</Button
            >
        </div>
    </form>
    {#if error || actionError}<p role="alert" class="text-sm text-error wrap-anywhere">
            {error || actionError}
        </p>{/if}
    {#if notice}<p role="status" class="text-sm text-success">{notice}</p>{/if}
</section>

<section class="flex min-w-0 flex-col gap-4" aria-labelledby={`${id}-history`} aria-busy={moving}>
    <h2 id={`${id}-history`} class="text-lg font-semibold">운영자 변경 이력</h2>
    {#if overview.entries.length === 0}
        <SectionState
            state="empty"
            message={overview.total ? '이 쪽에는 변경 이력이 없어요' : '아직 기록된 운영자 변경이 없어요'}
        />
    {:else}
        <ol role="list" class="divide-y divide-border border-y border-border">
            {#each overview.entries as entry (entry.id)}
                <li class="flex min-w-0 flex-col gap-2 py-4">
                    <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <h3 class="min-w-0 font-medium wrap-anywhere">
                            {entry.target.displayName}{entry.target.userId ? ` (${entry.target.userId})` : ''}
                            · {entry.kind === 'granted' ? '운영자 지정' : '권한 해제'}
                        </h3>
                        <time
                            datetime={entry.occurredAt}
                            class="shrink-0 text-sm text-text-muted tabular-nums"
                        >
                            {date.format(new Date(entry.occurredAt))}
                        </time>
                    </div>
                    <p class="text-sm text-text-muted wrap-anywhere">
                        담당: {entry.source === 'bootstrap'
                            ? '서버 초기 설정'
                            : (entry.actor?.displayName ?? '삭제된 사용자')}
                        {#if entry.source === 'web' && entry.actor?.userId}
                            ({entry.actor.userId})
                        {/if}
                    </p>
                </li>
            {/each}
        </ol>
    {/if}
    <div inert={locked}>
        <PageNav
            total={overview.total}
            {pageSize}
            current={currentPage}
            label="운영자 변경 이력 쪽 이동"
            onchange={onpagechange}
        />
    </div>
</section>
