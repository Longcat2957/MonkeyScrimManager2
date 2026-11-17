<script lang="ts">
    // 날짜 입력은 브라우저 로케일과 무관하게 YYYY/MM/DD로 보여 주고, 폼 값은 ISO(YYYY-MM-DD)로 유지한다.
    type Props = {
        label: string;
        value?: string;
        name?: string;
        error?: string;
        hint?: string;
        disabled?: boolean;
        required?: boolean;
        invalid?: boolean;
        describedby?: string;
        min?: string;
        max?: string;
        element?: HTMLInputElement | null;
    };

    let {
        label,
        value = $bindable(''),
        name,
        error = '',
        hint = '',
        disabled = false,
        required = false,
        invalid = false,
        describedby,
        min,
        max,
        element = $bindable(null)
    }: Props = $props();

    const id = $props.id();

    const toDisplay = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.replaceAll('-', '/') : '');

    // 실제 달력에 존재하는 날짜만 ISO로 인정한다.
    function parse(display: string): string | null {
        const digits = display.replace(/\D/g, '');
        if (digits.length !== 8) return null;
        const year = Number(digits.slice(0, 4));
        const month = Number(digits.slice(4, 6));
        const day = Number(digits.slice(6, 8));
        if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1) return null;
        const date = new Date(Date.UTC(year, month - 1, day));
        if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day)
            return null;
        const iso = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
        if (min && iso < min) return null;
        if (max && iso > max) return null;
        return iso;
    }

    let display = $state(toDisplay(value));

    // 외부에서 유효한 ISO 값을 넣으면 표시를 맞춘다. 사용자가 입력 중인 빈 값은 지우지 않는다.
    $effect(() => {
        if (value && parse(display) !== value) display = toDisplay(value);
    });

    function input(event: Event) {
        const target = event.currentTarget as HTMLInputElement;
        const digits = target.value.replace(/\D/g, '').slice(0, 8);
        let next = digits;
        if (digits.length > 4) next = `${digits.slice(0, 4)}/${digits.slice(4)}`;
        if (digits.length > 6) next = `${digits.slice(0, 4)}/${digits.slice(4, 6)}/${digits.slice(6)}`;
        display = next;
        value = parse(next) ?? '';
        target.value = next;
    }

    const described = $derived(
        [describedby, error ? `${id}-error` : hint ? `${id}-hint` : ''].filter(Boolean).join(' ') || undefined
    );
</script>

<div class="flex min-w-0 flex-col gap-1">
    <label for={`${id}-date`} class="text-xs font-semibold text-text-muted">{label}</label>
    <input
        id={`${id}-date`}
        bind:this={element}
        type="text"
        inputmode="numeric"
        autocomplete="off"
        placeholder="YYYY/MM/DD"
        maxlength="10"
        bind:value={display}
        oninput={input}
        {disabled}
        {required}
        aria-invalid={error || invalid ? 'true' : undefined}
        aria-describedby={described}
        class={[
            'min-h-11 w-full min-w-0 rounded-(--radius-form) border bg-bg-surface px-3 text-sm text-text-primary tabular-nums',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hex',
            'disabled:cursor-not-allowed disabled:opacity-45 dark:bg-bg-surface-dark dark:text-text-dark',
            error || invalid ? 'border-error' : 'border-brass-line'
        ]}
    />
    {#if name && value}<input type="hidden" {name} {value} />{/if}
    {#if error}
        <p id={`${id}-error`} class="text-xs text-error">{error}</p>
    {:else if hint}
        <p id={`${id}-hint`} class="text-xs text-text-muted">{hint}</p>
    {/if}
</div>
