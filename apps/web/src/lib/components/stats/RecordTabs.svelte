<script lang="ts">
    import { page } from '$app/state';

    const base = $derived(page.url.pathname.replace(/\/(?:auction\/?)?$/, ''));
    const season = $derived(page.url.searchParams.get('season'));
    const query = $derived(season ? `?${new URLSearchParams({ season })}` : '');
    const auction = $derived(page.url.pathname.replace(/\/$/, '').endsWith('/auction'));
</script>

<nav aria-label="기록 종류" class="mb-5 flex gap-6 border-b border-line">
    {#each ['게임', '경매'] as label, i (label)}
        {@const active = auction === (i === 1)}
        <a
            href={`${base}${i ? '/auction' : ''}${query}`}
            aria-current={active ? 'page' : undefined}
            class={[
                '-mb-px inline-flex min-h-11 items-center border-b-2 px-1 text-sm font-bold',
                active ? 'border-nexus text-ink' : 'border-transparent text-muted hover:text-ink'
            ]}>{label}</a
        >
    {/each}
</nav>
