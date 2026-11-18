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

<div class="flex w-full max-w-5xl min-w-0 flex-col gap-4">
    <h1 class="page-head text-title font-bold">백오피스</h1>

    <section aria-labelledby="service-status" aria-busy={checking} class="panel">
        <div class="panel-bar">
            <h2 id="service-status" class="font-bold">서비스 상태</h2>
            <div class="flex flex-wrap items-center gap-2 text-ui">
                {#await data.status then status}
                    <time datetime={status.checkedAt} class="text-muted"
                        >{checkedTime.format(new Date(status.checkedAt))} 확인</time
                    >
                {/await}
                <Button variant="secondary" loading={checking} disabled={checking} onclick={recheck}>
                    다시 확인
                </Button>
            </div>
        </div>

        {#if checkError}<p role="alert" class="px-4 py-2 text-ui text-error">{checkError}</p>{/if}

        {#await data.status}
            <SectionState state="loading" lines={2} />
        {:then status}
            <ul aria-live="polite" class="divide-y divide-line">
                {#each status.services as service (service.key)}
                    {@const label = SERVICE_STATE_LABEL[service.state]}
                    <li
                        class="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 sm:grid sm:grid-cols-[8rem_5rem_minmax(0,1fr)] sm:justify-items-start"
                    >
                        <span class="text-sm font-semibold">{service.name}</span>
                        <StatusTag text={label.text} state={label.state} />
                        <span class="basis-full text-ui text-muted wrap-anywhere sm:justify-self-end">
                            {[service.issue, service.detail].filter(Boolean).join(' · ')}
                        </span>
                    </li>
                {/each}
            </ul>
        {:catch}
            <!-- 다시 확인은 제목 옆 버튼 하나로 한다. -->
            {#if !checkError}<p role="alert" class="px-4 py-3 text-ui text-error">
                    상태를 확인하지 못했어요
                </p>{/if}
        {/await}
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
