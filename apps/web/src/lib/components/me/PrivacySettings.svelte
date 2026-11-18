<script lang="ts">
    import { untrack } from 'svelte';
    import { enhance, type SubmitFunction } from '$app/forms';
    import Button from '#lib/components/common/Button.svelte';
    import type { MyPrivacy, PrivacyPreferences } from '#lib/features/me/privacy.ts';
    import SwitchCell from '#lib/components/common/SwitchCell.svelte';
    import { confirm } from '#lib/ui/confirm.ts';
    import { preventComposingSubmit } from '#lib/ui/form.ts';

    type Props = {
        privacy: MyPrivacy;
        preview?: boolean;
        initialValues?: PrivacyPreferences;
        initialError?: string;
        initialWithdrawError?: string;
    };
    let {
        privacy,
        preview = false,
        initialValues,
        initialError = '',
        initialWithdrawError = ''
    }: Props = $props();
    const id = $props.id();
    let publicProfile = $state(untrack(() => initialValues?.publicProfile ?? privacy.publicProfile));
    let publicRiotIds = $state(untrack(() => initialValues?.publicRiotIds ?? privacy.publicRiotIds));
    let source = $state.raw(untrack(() => privacy));
    let busy = $state<'privacy' | 'withdraw' | null>(null);
    let confirming = $state(false);
    let error = $state(untrack(() => initialError));
    let notice = $state('');
    let withdrawError = $state(untrack(() => initialWithdrawError));
    let refreshRequired = $state(false);
    const locked = $derived(Boolean(busy) || refreshRequired);
    const dirty = $derived(
        publicProfile !== privacy.publicProfile || publicRiotIds !== privacy.publicRiotIds
    );
    const action = (name: string) => (preview ? `?mock=1&/${name}` : `?/${name}`);

    $effect(() => {
        const current = privacy;
        if (current === source) return;
        if (!busy && publicProfile === source.publicProfile && publicRiotIds === source.publicRiotIds) {
            publicProfile = current.publicProfile;
            publicRiotIds = current.publicRiotIds;
        }
        source = current;
    });

    const save: SubmitFunction = ({ cancel }) => {
        if (locked || confirming || !dirty) {
            cancel();
            return;
        }
        busy = 'privacy';
        error = '';
        withdrawError = '';
        notice = '';
        return async ({ result, update }) => {
            try {
                if (result.type === 'success') {
                    await update({ reset: false });
                    publicProfile = privacy.publicProfile;
                    publicRiotIds = privacy.publicRiotIds;
                    notice = '공개 설정을 저장했어요.';
                } else if (result.type === 'failure') {
                    error = String(result.data?.message ?? '설정을 저장하지 못했어요. 다시 시도해 주세요.');
                } else {
                    refreshRequired = true;
                    error = '저장 결과를 확인하지 못했어요. 새로고침해 현재 설정을 확인해 주세요.';
                }
            } catch {
                refreshRequired = true;
                error =
                    result.type === 'success'
                        ? '설정은 저장했지만 화면을 갱신하지 못했어요. 새로고침해 현재 설정을 확인해 주세요.'
                        : '연결을 확인한 뒤 새로고침해 현재 설정을 확인해 주세요.';
            } finally {
                busy = null;
            }
        };
    };

    const withdraw: SubmitFunction = async ({ cancel }) => {
        if (locked || confirming || privacy.withdrawalBlock) {
            cancel();
            return;
        }
        error = '';
        notice = '';
        withdrawError = '';
        confirming = true;
        let agreed = false;
        try {
            agreed = await confirm(
                '표시 이름·아바타·서버별 계정 연결·선호 정보를 정리하고 모든 기기에서 로그아웃해요. 나중에 Discord로 다시 로그인하면 서비스를 다시 이용할 수 있어요. 탈퇴할까요?',
                '서비스 탈퇴'
            );
        } catch {
            withdrawError = '확인창을 열지 못했어요. 다시 시도해 주세요.';
        } finally {
            confirming = false;
        }
        if (!agreed) {
            cancel();
            return;
        }
        busy = 'withdraw';
        return async ({ result, update }) => {
            try {
                if (result.type === 'redirect') await update({ reset: false });
                else if (result.type === 'failure') {
                    withdrawError = String(result.data?.message ?? '탈퇴하지 못했어요. 다시 시도해 주세요.');
                } else {
                    refreshRequired = true;
                    withdrawError = '탈퇴 결과를 확인하지 못했어요. 새로고침해 현재 계정을 확인해 주세요.';
                }
            } catch {
                refreshRequired = true;
                withdrawError = '연결을 확인한 뒤 새로고침해 현재 계정을 확인해 주세요.';
            } finally {
                busy = null;
            }
        };
    };
</script>

<section id="privacy" aria-labelledby={`${id}-privacy`} class="min-w-0">
    <h2 id={`${id}-privacy`} class="mb-3 text-lg font-bold">공개 설정</h2>
    <form
        method="POST"
        action={action('privacy')}
        use:enhance={save}
        {@attach preventComposingSubmit}
        aria-label="공개 설정 저장"
        aria-busy={busy === 'privacy'}
        class="panel min-w-0"
    >
        <input type="hidden" name="publicProfile" value={String(publicProfile)} />
        <input type="hidden" name="publicRiotIds" value={String(publicRiotIds)} />
        <fieldset disabled={locked} class="min-w-0">
            <legend class="sr-only">공개할 정보</legend>
            <SwitchCell
                title="프로필 정보 공개"
                subTitle="표시 이름·아바타·Discord ID"
                bind:active={publicProfile}
                disabled={locked}
                line
            />
            <SwitchCell title="Riot ID 공개" bind:active={publicRiotIds} disabled={locked} />
        </fieldset>
        <div
            class="grid min-w-0 gap-3 border-t border-line px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
        >
            <p class="max-w-prose text-ui text-muted">
                경기 결과·MMR은 계속 공개되며, 탈퇴해도 보존돼요. 서버 관리자는 계정 운영에 필요한 정보를 계속
                볼 수 있어요.
            </p>
            <Button variant="primary" type="submit" disabled={locked || !dirty} loading={busy === 'privacy'}
                >공개 설정 저장</Button
            >
            {#if error}<p role="alert" class="col-span-full text-ui text-error">{error}</p>{/if}
            {#if notice}<p role="status" class="col-span-full text-ui text-success">{notice}</p>{/if}
        </div>
    </form>
</section>

<section
    aria-labelledby={`${id}-withdraw`}
    class="flex flex-wrap items-center justify-between gap-3 border-t border-line px-1 py-3"
>
    <div class="min-w-[min(100%,12rem)] flex-1">
        <h2 id={`${id}-withdraw`} class="text-sm font-semibold">서비스 탈퇴</h2>
        {#if privacy.withdrawalBlock}<p class="mt-1 text-ui text-muted">
                {privacy.withdrawalBlock}
            </p>{/if}
        {#if withdrawError}<p role="alert" class="text-ui text-error">{withdrawError}</p>{/if}
    </div>
    <form
        method="POST"
        action={action('withdraw')}
        use:enhance={withdraw}
        aria-label="서비스 탈퇴"
        aria-busy={busy === 'withdraw'}
    >
        <input type="hidden" name="confirm" value="true" />
        <Button
            variant="danger"
            type="submit"
            disabled={locked || Boolean(privacy.withdrawalBlock)}
            loading={busy === 'withdraw'}>서비스 탈퇴</Button
        >
    </form>
</section>
