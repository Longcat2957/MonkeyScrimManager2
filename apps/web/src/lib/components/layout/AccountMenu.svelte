<script lang="ts">
    import type { Snippet } from 'svelte';
    import { resolve } from '$app/paths';
    import { page } from '$app/state';
    import PlayerFace from '#lib/components/common/PlayerFace.svelte';
    import MenuButton from './MenuButton.svelte';
    import { logout } from './logout.ts';

    type Props = {
        align?: 'left' | 'right';
        side?: 'down' | 'up';
        /** 레일에 놓일 때는 이름·화살표가 레일 접기에 따라 사라진다. */
        rail?: boolean;
        triggerClass?: string;
        footer?: Snippet;
        onselect?: () => void;
    };

    let {
        align = 'left',
        side = 'down',
        rail = false,
        triggerClass = '',
        footer,
        onselect
    }: Props = $props();

    const user = $derived(page.data.user ?? null);
    const pathname = $derived(page.url.pathname);
    const mock = $derived(page.data.mockPreview ? '?mock=1' : '');
    const items = $derived(
        user
            ? [
                  { label: '내 정보', href: `${resolve('/(app)/me')}${mock}`, current: pathname === '/me' },
                  ...(user.isServiceAdmin
                      ? [
                            {
                                label: '백오피스',
                                href: `${resolve('/(app)/backoffice')}${mock}`,
                                current: pathname.startsWith('/backoffice')
                            }
                        ]
                      : []),
                  ...(page.data.authenticated ? [{ label: '로그아웃', href: '', current: false }] : [])
              ]
            : []
    );

    function select(index: number) {
        onselect?.();
        const item = items[index];
        if (!item) return;
        if (item.label === '로그아웃') logout();
        else location.assign(item.href);
    }
</script>

{#if user}
    <MenuButton
        label="계정 메뉴"
        actions={items.map((item) => ({ content: item.label, current: item.current }))}
        {align}
        {side}
        onselect={select}
        triggerVariant="secondary"
        triggerClass={[
            'gap-2.5 overflow-hidden p-2 not-hover:bg-surface',
            rail && 'rail-control',
            triggerClass
        ]
            .filter(Boolean)
            .join(' ')}
        {footer}
    >
        <PlayerFace name={user.displayName} imageUrl={user.avatarUrl} size="sm" />
        <span class={['min-w-0 flex-1 truncate text-left text-ui', rail && 'rail-label']}
            >{user.displayName}</span
        >
        <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            class={['size-4 shrink-0 text-muted', rail && 'rail-label', side === 'down' && 'rotate-180']}
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"><path d="m4 10 4-4 4 4" /></svg
        >
    </MenuButton>
{/if}
