<script lang="ts">
    import { tick, untrack } from 'svelte';
    import type { Attachment } from 'svelte/attachments';
    import { Button, Checkbox, Popup, Radio } from 'stdf';
    import { enhance, type SubmitFunction } from '$app/forms';
    import { invalidateAll } from '$app/navigation';
    import type { LolPosition } from '#lib/features/guild/types.ts';
    import { POSITIONS } from '#lib/features/labels.ts';
    import type { RegistrationAccount } from '#lib/features/scrims/types.ts';
    import { nonSubmitButtons } from '#lib/ui/form.ts';
    import { overlay } from '#lib/ui/overlay.ts';
    import { desktop } from '#lib/ui/viewport.svelte.ts';

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

    const POSITION_ITEMS = POSITIONS.map((position) => ({ name: position.key, label: position.text }));

    let accountId = $state(untrack(() => initialAccount));
    let positions = $state<string[]>(untrack(() => [...initialPositions]));
    let positionsError = $state('');
    let formError = $state('');
    let pending = $state(false);
    let refreshRequired = $state(false);
    let form = $state<HTMLFormElement>();
    let popupPosition = $state<'center' | 'bottom'>('bottom');
    const id = $props.id();

    const title = $derived(editing ? '신청 수정' : '참가 신청');
    const accountItems = $derived([
        { name: '', label: '계정 없이 참가' },
        ...accounts.map((item) => ({ name: item.id, label: item.riotId }))
    ]);

    $effect(() => {
        if (!open) popupPosition = desktop.current ? 'center' : 'bottom';
    });

    // STDF의 선택 버튼을 유지하면서 선택 여부를 알리고 기존 키보드 동작을 사용한다.
    function selectedOptions(selected: boolean[], errorId?: string): Attachment<HTMLElement> {
        return (node) => {
            const apply = () => {
                for (const [index, button] of node.querySelectorAll('button').entries()) {
                    button.type = 'button';
                    button.setAttribute('aria-pressed', String(selected[index] ?? false));
                    if (errorId) button.setAttribute('aria-describedby', errorId);
                    else button.removeAttribute('aria-describedby');
                }
            };
            apply();
            const observer = new MutationObserver(apply);
            observer.observe(node, { childList: true, subtree: true });
            return () => observer.disconnect();
        };
    }

    async function focusPositionError() {
        await tick();
        form?.querySelector<HTMLButtonElement>('[data-positions] button')?.focus();
    }

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

    const submit: SubmitFunction = ({ formData, cancel }) => {
        if (pending || refreshRequired) {
            cancel();
            return;
        }
        formError = '';
        positionsError = positions.length ? '' : '희망 포지션을 하나 이상 골라 주세요';
        if (positionsError) {
            cancel();
            void focusPositionError();
            return;
        }
        formData.set('riotAccountId', accountId);
        formData.set('positions', positions.join(','));
        pending = true;
        return async ({ result, update }) => {
            try {
                if (result.type === 'success') {
                    // 내 신청 줄이 바뀌는 것으로 결과가 보이므로 따로 알리지 않는다.
                    await update({ reset: false });
                    open = false;
                } else if (result.type === 'failure') {
                    positionsError = String(result.data?.positionsError ?? '');
                    formError = positionsError ? '' : String(result.data?.message ?? '저장하지 못했어요');
                    // 동시 신청으로 마감됐을 수 있으므로 최신 정원을 다시 불러온다.
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
                if (positionsError) void focusPositionError();
            }
        };
    };
</script>

<div {@attach overlay({ open, label: title, onclose: close })}>
    <Popup bind:visible={open} position={popupPosition} size={0} maskClosable={false} transparent>
        <form
            bind:this={form}
            method="POST"
            action={editing ? '?/registration' : '?/register'}
            novalidate
            aria-busy={pending}
            use:enhance={submit}
            {@attach nonSubmitButtons}
            class="mx-auto flex max-h-[90dvh] w-full max-w-md flex-col gap-5 overflow-y-auto rounded-t-(--radius-box) bg-bg-surface p-6 lg:rounded-(--radius-box) dark:bg-bg-surface-dark"
        >
            <h2 class="text-lg font-semibold">{title}</h2>

            {#if accounts.length > 0}
                <fieldset
                    disabled={pending || refreshRequired}
                    class="flex flex-col gap-2"
                    {@attach selectedOptions(accountItems.map((account) => account.name === accountId))}
                >
                    <legend class="mb-2 text-sm font-medium">Riot 계정 (선택)</legend>
                    <Radio data={accountItems} bind:value={accountId} layout="v" />
                </fieldset>
            {/if}

            <fieldset
                disabled={pending || refreshRequired}
                aria-describedby={positionsError ? `${id}-positions-error` : undefined}
                data-positions
                class="flex flex-col gap-2"
                {@attach selectedOptions(
                    POSITIONS.map((position) => positions.includes(position.key)),
                    positionsError ? `${id}-positions-error` : undefined
                )}
            >
                <legend class="mb-2 text-sm font-medium">희망 포지션</legend>
                <Checkbox data={POSITION_ITEMS} bind:checkeds={positions} layout="h" />
                {#if positionsError}
                    <p id={`${id}-positions-error`} role="alert" class="text-sm text-error">
                        {positionsError}
                    </p>
                {/if}
            </fieldset>

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
                    {editing ? '저장' : '신청하기'}
                </Button>
            </div>
        </form>
    </Popup>
</div>
