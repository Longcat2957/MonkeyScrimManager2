<script lang="ts">
    import type { Snippet } from 'svelte';
    import type { Attachment } from 'svelte/attachments';
    import { Switch } from 'stdf';

    type Props = {
        title: string;
        subTitle?: string;
        active: boolean;
        disabled?: boolean;
        // 마지막 행이 아니면 STDF Cell처럼 안쪽으로 들인 구분선을 그린다.
        line?: boolean;
        // 제목 왼쪽의 사진 등 장식.
        leftChild?: Snippet;
        // 폼 안에서 값만 바인딩할 때는 생략한다.
        onchange?: (active: boolean) => void;
    };

    let {
        title,
        subTitle = '',
        active = $bindable(),
        disabled = false,
        line = false,
        leftChild,
        onchange
    }: Props = $props();
    const id = $props.id();

    // STDF 3의 Switch는 상태·비활성 의미를 실제 버튼에 전달하지 않는다.
    const accessible: Attachment<HTMLLabelElement> = (node) => {
        const checked = active;
        const unavailable = disabled;
        const button = node.querySelector('button');
        if (!button) return;
        button.type = 'button';
        button.disabled = unavailable;
        button.setAttribute('role', 'switch');
        button.setAttribute('aria-checked', String(checked));
        button.setAttribute('aria-labelledby', `${id}-title`);
        if (subTitle) button.setAttribute('aria-describedby', `${id}-description`);
        else button.removeAttribute('aria-describedby');
    };
</script>

<!--
	STDF Cell의 스위치 행은 button 안에 Switch button이 들어가 HTML이 깨진다.
	행은 label로 만들어 STDF Switch 하나만 조작 요소로 두고, 제목·현재 값을 그 이름으로 쓴다.
	모양은 CellGroup 안의 Cell과 같은 클래스를 쓴다.
-->
<label class="block cursor-pointer bg-bg-surface px-3 dark:bg-bg-surface-dark" {@attach accessible}>
    <span
        class={[
            'flex w-full items-center justify-between gap-4 py-4',
            line && 'border-b border-text-primary/5 dark:border-text-dark/5'
        ]}
    >
        {#if leftChild}<span class="shrink-0">{@render leftChild()}</span>{/if}
        <span class="flex min-w-0 flex-1 flex-col">
            <span id={`${id}-title`} class="font-medium">{title}</span>
            {#if subTitle}
                <span id={`${id}-description`} class="text-xs text-text-muted">{subTitle}</span>
            {/if}
        </span>
        <span class="shrink-0">
            <Switch bind:active inside="state" radius="full" {disabled} {onchange} />
        </span>
    </span>
</label>
