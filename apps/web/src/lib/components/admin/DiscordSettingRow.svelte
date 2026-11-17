<script lang="ts">
    import Button from '#lib/components/common/Button.svelte';
    import PopoverMenu from '#lib/components/common/PopoverMenu.svelte';
    import type { MenuAction } from '#lib/components/common/menu.ts';

    type Props = {
        label: string;
        description: string;
        // 지금 설정된 값을 사람이 읽을 수 있게 쓴 문구
        value: string;
        actions: MenuAction[];
        busy: boolean;
        disabled: boolean;
        onselect: (index: number) => void;
    };

    let { label, description, value, actions, busy, disabled, onselect }: Props = $props();
    let open = $state(false);
</script>

<!-- 선택지가 많아 Radio 대신 현재 값 버튼으로 메뉴를 연다. -->
<li class="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
    <span class="flex basis-full flex-col sm:basis-auto sm:flex-1">
        <span class="font-medium">{label}</span>
        <span class="text-xs opacity-60">{description}</span>
    </span>
    <span data-menu-trigger class="relative inline-flex min-w-0 max-w-full sm:ml-auto">
        <Button
            variant="secondary"
            size="auto"
            injClass="min-h-11 max-w-full gap-1.5 px-3 text-sm"
            loading={busy}
            {disabled}
            onclick={() => {
                if (!disabled) open = !open;
            }}
        >
            <span class="sr-only">{label} 바꾸기, 현재 </span><span class="min-w-0 wrap-anywhere"
                >{value}</span
            >
            <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                class="size-4 opacity-60"
                fill="none"
                stroke="currentColor"
                stroke-width="2"><path d="m6 9 6 6 6-6" /></svg
            >
        </Button>
        <PopoverMenu
            bind:open
            {label}
            {actions}
            align="right"
            onselect={(index) => {
                open = false;
                if (!disabled) onselect(index);
            }}
        />
    </span>
</li>
