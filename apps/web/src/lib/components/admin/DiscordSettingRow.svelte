<script lang="ts">
    import { Button } from 'stdf';
    import type { ActionProps } from 'stdf';
    import ActionMenu from '#lib/components/common/ActionMenu.svelte';

    type Props = {
        label: string;
        description: string;
        // 지금 설정된 값을 사람이 읽을 수 있게 쓴 문구
        value: string;
        actions: ActionProps[];
        busy: boolean;
        onselect: (index: number) => void;
    };

    let { label, description, value, actions, busy, onselect }: Props = $props();
    let open = $state(false);
    let trigger: HTMLElement | null = $state(null);
</script>

<!-- 선택지가 많아 Radio 대신 현재 값 버튼으로 메뉴(데스크톱 팝오버, 모바일 시트)를 연다. -->
<li class="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
    <span class="flex basis-full flex-col sm:basis-auto sm:flex-1">
        <span class="font-medium">{label}</span>
        <span class="text-xs opacity-60">{description}</span>
    </span>
    <span bind:this={trigger} class="inline-flex sm:ml-auto">
        <Button
            fill="lineLight"
            size="auto"
            heightOut="0"
            heightIn="2"
            injClass="gap-1.5 px-3 text-sm"
            loading={busy ? {} : null}
            onclick={() => (open = !open)}
        >
            <span class="sr-only">{label} 바꾸기, 현재 </span>{value}
            <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                class="size-4 opacity-60"
                fill="none"
                stroke="currentColor"
                stroke-width="2"><path d="m6 9 6 6 6-6" /></svg
            >
        </Button>
    </span>
    <ActionMenu
        bind:open
        {label}
        {actions}
        {trigger}
        onselect={(index) => ((open = false), onselect(index))}
    />
</li>
