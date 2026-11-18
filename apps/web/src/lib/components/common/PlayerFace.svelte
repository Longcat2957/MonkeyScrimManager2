<script lang="ts">
    // 사진과 이름 첫 글자는 장식이므로 옆의 이름을 중복해서 읽지 않는다.
    let {
        name,
        imageUrl,
        size = 'md'
    }: { name: string; imageUrl: string | null; size?: 'xs' | 'sm' | 'md' | 'lg' } = $props();

    const SIZE = {
        xs: 'size-6 text-micro',
        sm: 'size-7 text-xs',
        md: 'size-8 text-ui',
        lg: 'size-14 text-xl'
    };
    const crest = 'shrink-0 rounded-(--radius-form) border border-line-strong bg-surface-2';
    let failedUrl = $state<string | null>(null);
</script>

{#if imageUrl && imageUrl !== failedUrl}
    <img
        src={imageUrl}
        alt=""
        loading="lazy"
        referrerpolicy="no-referrer"
        class={[crest, 'object-cover', SIZE[size]]}
        onerror={(event) => (failedUrl = event.currentTarget.getAttribute('src'))}
    />
{:else}
    <span
        aria-hidden="true"
        class={[crest, 'inline-flex items-center justify-center font-bold text-nexus', SIZE[size]]}
    >
        {String.fromCodePoint(name.codePointAt(0) ?? 63)}
    </span>
{/if}
