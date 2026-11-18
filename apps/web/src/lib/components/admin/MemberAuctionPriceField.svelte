<script lang="ts">
    import Button from '#lib/components/common/Button.svelte';
    import { postAction } from '#lib/ui/actions.ts';
    import { preventComposingSubmit } from '#lib/ui/form.ts';
    import { toast } from '#lib/ui/toast.ts';

    let {
        member,
        kind
    }: {
        member: {
            userId: string;
            displayName: string;
            auctionSeedPrice: number | null;
            auctionOverridePrice: number | null;
        };
        kind: 'seed' | 'override';
    } = $props();
    const id = $props.id();
    const label = $derived(kind === 'seed' ? '경매 초기가' : '추첨 보정가');
    const saved = $derived(
        String((kind === 'seed' ? member.auctionSeedPrice : member.auctionOverridePrice) ?? '')
    );
    let draft = $state<string | null>(null);
    const value = $derived(draft ?? saved);
    let busy = $state(false);
    let error = $state('');
    const invalid = $derived(
        value !== '' && (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 2_147_483_647)
    );
    const message = $derived(invalid ? '1~2,147,483,647 사이의 정수를 입력해 주세요.' : error);

    async function save(event: SubmitEvent) {
        event.preventDefault();
        if (busy || invalid || value === saved) return;
        busy = true;
        try {
            error =
                (await postAction('auctionSeedPrice', { userId: member.userId, kind, price: value })) ?? '';
            if (!error) {
                draft = null;
                toast.success(`${member.displayName}님의 ${label}를 ${value === '' ? '해제' : '저장'}했어요`);
            }
        } finally {
            busy = false;
        }
    }
</script>

<form
    method="POST"
    action="?/auctionSeedPrice"
    class="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1"
    aria-busy={busy}
    {@attach preventComposingSubmit}
    onsubmit={save}
>
    <input type="hidden" name="userId" value={member.userId} />
    <input type="hidden" name="kind" value={kind} />
    <label for={id} class="col-span-full text-xs font-semibold text-ink-2">
        {label} (P)<span class="sr-only">, {member.displayName} ({member.userId})</span>
    </label>
    <input
        {id}
        name="price"
        inputmode="numeric"
        autocomplete="off"
        placeholder="미설정"
        readonly={busy}
        {value}
        aria-invalid={invalid || undefined}
        aria-describedby={message ? `${id}-error` : undefined}
        class={[
            'min-h-9 w-full min-w-0 rounded-form border bg-surface-2 px-2.5 text-sm text-ink tabular-nums pointer-coarse:min-h-11',
            message ? 'border-error' : 'border-line-strong'
        ]}
        oninput={(event) => {
            draft = event.currentTarget.value === saved ? null : event.currentTarget.value;
            error = '';
        }}
    />
    <Button
        type="submit"
        disabled={invalid || value === saved}
        loading={busy}
        ariaLabel={`${label} 저장, ${member.displayName} (${member.userId})`}>저장</Button
    >
    {#if message}<p id={`${id}-error`} role="alert" class="col-span-full text-xs text-error wrap-anywhere">
            {message}
        </p>{/if}
</form>
