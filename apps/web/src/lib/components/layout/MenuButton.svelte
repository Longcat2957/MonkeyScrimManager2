<script lang="ts">
    import type { Snippet } from 'svelte';
    import Button from '#lib/components/common/Button.svelte';
    import PopoverMenu from '#lib/components/common/PopoverMenu.svelte';
    import type { MenuAction } from '#lib/components/common/menu.ts';

    type Props = {
        label: string;
        actions: MenuAction[];
        onselect: (index: number) => void;
        align?: 'left' | 'right';
        side?: 'down' | 'up';
        triggerVariant?: 'quiet' | 'secondary';
        triggerClass?: string;
        footer?: Snippet;
        children: Snippet;
    };

    let {
        label,
        actions,
        onselect,
        align = 'left',
        side = 'down',
        triggerVariant = 'quiet',
        triggerClass = '',
        footer,
        children
    }: Props = $props();
    let open = $state(false);
</script>

<span class="relative inline-flex min-w-0 max-w-full">
    <Button
        variant={triggerVariant}
        class={triggerClass}
        ariaLabel={label}
        aria-expanded={open}
        aria-haspopup="menu"
        onclick={() => (open = !open)}
    >
        {@render children()}
    </Button>
    <PopoverMenu
        bind:open
        {label}
        {actions}
        {align}
        {side}
        {footer}
        onselect={(index) => {
            open = false;
            onselect(index);
        }}
    />
</span>
