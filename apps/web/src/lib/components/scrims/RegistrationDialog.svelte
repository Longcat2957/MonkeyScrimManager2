<script lang="ts">
    import { tick, untrack } from 'svelte';
    import { enhance, type SubmitFunction } from '$app/forms';
    import { invalidateAll } from '$app/navigation';
    import type { LolPosition } from '#lib/features/guild/types.ts';
    import { POSITIONS } from '#lib/features/labels.ts';
    import type { RegistrationAccount } from '#lib/features/scrims/types.ts';
    import Button from '#lib/components/common/Button.svelte';
    import CheckboxField from '#lib/components/common/CheckboxField.svelte';
    import Dialog from '#lib/components/common/Dialog.svelte';
    import SelectField from '#lib/components/common/SelectField.svelte';

    type Props = {
        open: boolean;
        // 신청이 없으면 새 신청(register), 있으면 수정(registration)이다.
        editing: boolean;
        accounts: RegistrationAccount[];
        accountId: string;
        positions: LolPosition[];
    };

    let {
        open = $bindable(false),
        editing,
        accounts,
        accountId: initialAccount,
        positions: initialPositions
    }: Props = $props();

    let accountId = $state(untrack(() => initialAccount));
    let positions = $state<LolPosition[]>(untrack(() => [...initialPositions]));
    let positionsError = $state('');
    let formError = $state('');
    let pending = $state(false);
    let refreshRequired = $state(false);
    let form = $state<HTMLFormElement>();

    const title = $derived(editing ? '신청 수정' : '참가 신청');
    const accountOptions = $derived([
        { value: '', label: '계정 없이 참가' },
        ...accounts.map((item) => ({ value: item.id, label: item.riotId }))
    ]);

    // 열 때마다 현재 신청 값에서 다시 시작한다.
    $effect(() => {
        if (!open) return;
        untrack(() => {
            accountId = initialAccount;
            positions = [...initialPositions];
            positionsError = '';
            formError = '';
            refreshRequired = false;
        });
    });

    function close() {
        if (!pending) open = false;
    }

    function toggle(position: LolPosition) {
        positions = positions.includes(position)
            ? positions.filter((item) => item !== position)
            : [...positions, position];
    }

    const submit: SubmitFunction = ({ formData, cancel }) => {
        if (pending || refreshRequired) {
            cancel();
            return;
        }
        formError = '';
        positionsError = positions.length ? '' : '희망 포지션을 하나 이상 골라 주세요';
        if (positionsError) {
            cancel();
            return;
        }
        formData.set('riotAccountId', accountId);
        formData.set('positions', positions.join(','));
        pending = true;
        return async ({ result, update }) => {
            try {
                if (result.type === 'success') {
                    await update({ reset: false });
                    open = false;
                } else if (result.type === 'failure') {
                    positionsError = String(result.data?.positionsError ?? '');
                    formError = positionsError ? '' : String(result.data?.message ?? '저장하지 못했어요');
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
                await tick();
            }
        };
    };
</script>

<Dialog {open} {title} onclose={close}>
    <form
        bind:this={form}
        method="POST"
        action={editing ? '?/registration' : '?/register'}
        novalidate
        aria-busy={pending}
        use:enhance={submit}
        class="flex flex-col gap-4"
    >
        {#if accounts.length > 0}
            <SelectField
                label="Riot 계정 (선택)"
                bind:value={accountId}
                options={accountOptions}
                disabled={pending || refreshRequired}
            />
        {/if}

        <fieldset class="flex flex-col gap-2" disabled={pending || refreshRequired}>
            <legend class="mb-1 text-xs font-semibold text-text-muted">희망 포지션</legend>
            <div class="grid gap-2 sm:grid-cols-2">
                {#each POSITIONS as position (position.key)}
                    <CheckboxField
                        label={position.text}
                        checked={positions.includes(position.key)}
                        onchange={() => toggle(position.key)}
                        disabled={pending}
                    />
                {/each}
            </div>
            {#if positionsError}
                <p role="alert" class="text-sm text-error">{positionsError}</p>
            {/if}
        </fieldset>

        {#if formError}
            <p role="alert" class="text-sm text-error">{formError}</p>
        {/if}

        <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" type="button" disabled={pending} onclick={close}>취소</Button>
            <Button variant="primary" type="submit" loading={pending} disabled={pending || refreshRequired}>
                {editing ? '저장' : '신청하기'}
            </Button>
        </div>
    </form>
</Dialog>
