<script lang="ts">
    import { Button } from 'stdf';
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

<div class="mx-auto flex w-full max-w-3xl flex-col gap-10">
    <h1 class="text-2xl font-semibold">백오피스</h1>

    <section aria-labelledby="service-status" aria-busy={checking} class="flex flex-col gap-3">
        <div class="flex flex-wrap items-center justify-between gap-3">
            <h2 id="service-status" class="text-lg font-semibold">서비스 상태</h2>
            <div class="flex items-center gap-3 text-sm">
                {#await data.status then status}
                    <time datetime={status.checkedAt} class="opacity-60"
                        >{checkedTime.format(new Date(status.checkedAt))} 확인</time
                    >
                {/await}
                <Button
                    fill="lineLight"
                    size="auto"
                    heightOut="0"
                    heightIn="2"
                    injClass="min-h-11 px-3 text-sm"
                    loading={checking ? {} : null}
                    disabled={checking}
                    onclick={recheck}
                >
                    다시 확인
                </Button>
            </div>
        </div>

        {#if checkError}<p role="alert" class="text-sm text-error">{checkError}</p>{/if}

        {#await data.status}
            <SectionState state="loading" lines={2} />
        {:then status}
            <ul
                aria-live="polite"
                class="flex flex-col divide-y divide-text-primary/5 rounded-(--radius-box) border border-border dark:divide-text-dark/5"
            >
                {#each status.services as service (service.key)}
                    {@const label = SERVICE_STATE_LABEL[service.state]}
                    <li class="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                        <span class="min-w-32 font-medium">{service.name}</span>
                        <StatusTag text={label.text} state={label.state} />
                        <span class="basis-full text-sm opacity-70 sm:ml-auto sm:basis-auto">
                            {[service.issue, service.detail].filter(Boolean).join(' · ')}
                        </span>
                    </li>
                {/each}
            </ul>
        {:catch}
            <!-- 다시 확인은 제목 옆 버튼 하나로 한다. -->
            {#if !checkError}<p
                    role="alert"
                    class="rounded-(--radius-box) border border-dashed border-border px-4 py-6 text-center text-sm text-error"
                >
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
