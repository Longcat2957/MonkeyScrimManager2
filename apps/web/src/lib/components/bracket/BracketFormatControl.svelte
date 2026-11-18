<script lang="ts">
    import { untrack } from 'svelte';
    import RadioGroup from '#lib/components/common/RadioGroup.svelte';
    import type { BestOf } from '#lib/features/scrims/bracket.ts';
    import { preventComposingSubmit } from '#lib/ui/form.ts';

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
        { value: '1', label: '단판' },
        { value: '3', label: '3전 2선승' },
        { value: '5', label: '5전 3선승' }
    ];
    let value = $state(untrack(() => String(bestOf)));

    // 서버에서 확인된 경기 방식이 바뀌면 선택도 그 값으로 맞춘다.
    $effect(() => {
        value = String(bestOf);
    });

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

<form onsubmit={(event) => event.preventDefault()} {@attach preventComposingSubmit}>
    <!-- 좁은 단계 머리에 맞춰 선택지를 한 줄로 펼치고, 단계 이름과 겹치지 않게 범례는 숨긴다. -->
    <div
        class="[&_fieldset]:flex-row [&_fieldset]:flex-wrap [&_fieldset]:items-center [&_fieldset]:gap-x-2 [&_fieldset]:gap-y-0 [&_label]:min-h-9 [&_label]:items-center [&_label]:text-xs [&_input]:mt-0 [&_legend]:sr-only pointer-coarse:[&_label]:min-h-11"
        onchange={(event) => void change((event.target as HTMLInputElement).value)}
    >
        <RadioGroup legend={`${label} 경기 방식`} name="bestOf" options={formats} bind:value {disabled} />
    </div>
</form>
