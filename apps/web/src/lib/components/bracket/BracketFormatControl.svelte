<script lang="ts">
    import { untrack } from 'svelte';
    import { Radio } from 'stdf';
    import type { BestOf } from '#lib/features/scrims/bracket.ts';
    import { nonSubmitButtons } from '#lib/ui/form.ts';

    let {
        label,
        bestOf,
        disabled,
        onchange
    }: {
        label: string;
        bestOf: BestOf;
        disabled: boolean;
        onchange: (value: BestOf) => Promise<void>;
    } = $props();

    const formats = [
        { name: '1', label: '단판' },
        { name: '3', label: '3전 2선승' },
        { name: '5', label: '5전 3선승' }
    ];
    let value = $state(untrack(() => String(bestOf)));
    $effect(() => {
        value = String(bestOf);
    });

    function exposeSelection(fieldset: HTMLFieldSetElement) {
        // STDF 3의 Radio는 선택 상태를 ARIA로 전달하지 않아 버튼에 보완한다.
        fieldset.querySelectorAll('button').forEach((button, index) => {
            button.setAttribute('aria-pressed', String(formats[index]?.name === value));
        });
    }

    async function change(next: string) {
        if (disabled || Number(next) === bestOf) return;
        try {
            await onchange(Number(next) as BestOf);
        } finally {
            // 저장 실패 시에도 서버에서 확인된 선택값으로 돌아간다.
            value = String(bestOf);
        }
    }
</script>

<form onsubmit={(event) => event.preventDefault()} {@attach nonSubmitButtons}>
    <fieldset
        {disabled}
        aria-label={`${label} 경기 방식`}
        class="text-xs [&_button]:min-h-11"
        {@attach exposeSelection}
    >
        <legend class="sr-only">{label} 경기 방식</legend>
        <Radio data={formats} bind:value layout="h" onchange={change} />
    </fieldset>
</form>
