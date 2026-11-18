<script lang="ts">
    import { resolve } from '$app/paths';
    import { page } from '$app/state';
    import Button from '#lib/components/common/Button.svelte';
    import { SERVICE_NAME } from '#lib/branding.ts';

    const messages: Record<number, { title: string; description: string }> = {
        401: {
            title: '로그인이 필요해요',
            description: '메뉴에서 Discord 계정으로 로그인해 주세요.'
        },
        403: {
            title: '접근 권한이 없어요',
            description: '운영자에게 이용 권한을 요청해 주세요.'
        },
        404: {
            title: '페이지를 찾을 수 없어요',
            description: '주소가 올바른지 확인해 주세요.'
        }
    };
    const message = $derived(
        messages[page.status] ?? {
            title: '페이지를 불러오지 못했어요',
            description: '잠시 후 다시 시도해 주세요.'
        }
    );
</script>

<svelte:head>
    <title>{message.title} | {SERVICE_NAME}</title>
    <meta name="robots" content="noindex" />
</svelte:head>

<section
    aria-labelledby="error-title"
    class="mx-auto grid min-h-[52vh] max-w-4xl content-center gap-5 sm:grid-cols-[auto_1fr] sm:items-center sm:gap-10"
>
    <p
        class="border-b border-line pb-3 font-brand text-7xl leading-none font-semibold text-muted tabular-nums sm:border-r sm:border-b-0 sm:py-8 sm:pr-10"
    >
        <span class="sr-only">오류 </span>{page.status}
    </p>
    <div>
        <h1 id="error-title" class="text-title font-bold sm:text-3xl">{message.title}</h1>
        <p class="mt-2 mb-5 text-sm leading-6 text-ink-2">{message.description}</p>
        {#if page.status >= 500}
            <Button variant="primary" onclick={() => window.location.reload()}>다시 시도</Button>
        {:else if page.status !== 401}
            <Button href={resolve('/')}>홈으로 돌아가기</Button>
        {/if}
    </div>
</section>
