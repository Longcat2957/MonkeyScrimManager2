<script lang="ts">
    import Button from '#lib/components/common/Button.svelte';
    import { goto, invalidate } from '$app/navigation';
    import { page } from '$app/state';
    import { SERVICE_NAME } from '#lib/branding.ts';
    import ServiceAdminManagement from '#lib/components/backoffice/ServiceAdminManagement.svelte';
    import SectionState from '#lib/components/common/SectionState.svelte';
    import StatusTag from '#lib/components/common/StatusTag.svelte';
    import { SERVICE_STATE_LABEL } from '#lib/features/backoffice/status.ts';
    import type { PageProps } from './$types';

    let { data, form }: PageProps = $props();

    let checking = $state(false);
    let checkError = $state('');

    const checkedTime = new Intl.DateTimeFormat('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
        timeZone: 'Asia/Seoul'
    });

    async function recheck() {
        if (checking) return;
        if (!navigator.onLine) {
            checkError = '인터넷에 연결되지 않았어요. 연결한 뒤 다시 확인해 주세요.';
            return;
        }
        checking = true;
        checkError = '';
        const previousStatus = data.status;
        try {
            await invalidate('app:service-status');
            if (data.status === previousStatus) {
                checkError = '새 상태를 확인하지 못했어요. 다시 확인해 주세요.';
                return;
            }
            await data.status;
        } catch {
            checkError = '상태를 다시 확인하지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.';
        } finally {
            checking = false;
        }
    }

    function changeAdminPage(next: number) {
        const url = new URL(page.url.href);
        url.searchParams.set('page', String(next));
        return goto(url, { reset: false });
    }
</script>

<svelte:head>
    <title>백오피스 | {SERVICE_NAME}</title>
</svelte:head>

<div class="grid w-full max-w-7xl min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
    <h1 class="page-head col-span-full text-title font-bold">백오피스</h1>

    <section
        aria-labelledby="service-status"
        aria-busy={checking}
        class="panel col-span-full grid overflow-hidden md:grid-cols-[13rem_minmax(0,1fr)]"
    >
        <div
            class="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-2 px-4 py-3 md:flex-col md:items-start md:justify-center md:border-r md:border-b-0"
        >
            <h2 id="service-status" class="text-lg font-bold">서비스 상태</h2>
            <Button variant="secondary" loading={checking} disabled={checking} onclick={recheck}>
                다시 확인
            </Button>
        </div>

        <div class="min-w-0">
            {#await data.status}
                <SectionState state="loading" lines={2} />
            {:then status}
                <ul aria-live="polite" class="grid grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))]">
                    {#each status.services as service (service.key)}
                        {@const label = SERVICE_STATE_LABEL[service.state]}
                        <li
                            class="grid min-w-0 content-start gap-2 border-r border-line px-4 py-3 last:border-r-0"
                        >
                            <div class="flex flex-wrap items-center gap-2">
                                <span class="min-w-0 text-sm font-semibold wrap-anywhere">{service.name}</span
                                >
                                <StatusTag text={label.text} state={label.state} />
                            </div>
                            <span class="text-ui text-muted wrap-anywhere">
                                {[service.issue, service.detail].filter(Boolean).join(' · ')}
                            </span>
                        </li>
                    {/each}
                </ul>
                <time
                    datetime={status.checkedAt}
                    class="block border-t border-line px-4 py-1.5 text-right text-xs text-muted tabular-nums"
                >
                    {checkedTime.format(new Date(status.checkedAt))} 확인
                </time>
            {:catch}
                <!-- 다시 확인은 제목 옆 버튼 하나로 한다. -->
                {#if !checkError}<p role="alert" class="px-4 py-3 text-ui text-error">
                        상태를 확인하지 못했어요
                    </p>{/if}
            {/await}
            {#if checkError}<p role="alert" class="px-4 py-2 text-ui text-error">{checkError}</p>{/if}
        </div>
    </section>

    <ServiceAdminManagement
        overview={data.overview}
        currentUserId={data.currentUserId}
        currentPage={data.page}
        pageSize={data.pageSize}
        actionError={form?.message}
        onpagechange={changeAdminPage}
    />
</div>
