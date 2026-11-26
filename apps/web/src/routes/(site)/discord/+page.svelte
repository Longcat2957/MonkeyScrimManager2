<script lang="ts">
    import { BOT_INVITE_URL, SERVICE_NAME } from '#lib/branding.ts';
    import Button from '#lib/components/common/Button.svelte';
    import DocLayout from '#lib/components/docs/DocLayout.svelte';
    import DocSection from '#lib/components/docs/DocSection.svelte';
    import { docHeadings } from '#lib/components/docs/toc.ts';

    const titles = {
        prepare: '설치 전에 확인하기',
        invite: '서버에 봇 추가',
        setup: '/초기설정 실행',
        channels: '게시 채널 연결',
        start: '첫 내전 열기'
    };
    const sections = docHeadings(titles);
</script>

<svelte:head>
    <title>봇 설치 안내 | {SERVICE_NAME}</title>
    <meta
        name="description"
        content={`Discord 서버에 ${SERVICE_NAME}을 추가하고 내전 운영을 준비하는 방법이에요.`}
    />
</svelte:head>

<DocLayout
    title="봇 설치 안내"
    lead={`Discord 서버에 ${SERVICE_NAME}을 추가하면 서버 멤버가 모집 글의 버튼으로 내전에 참가할 수 있어요.`}
    {sections}
>
    <DocSection id="prepare" title={titles.prepare}>
        <ul>
            <li>
                봇을 추가하려는 서버에서 <strong>서버 관리하기</strong> 권한이 있는 Discord 계정이 필요해요.
            </li>
            <li>참가자는 웹 가입이나 Riot 계정 연결 없이 Discord에서 바로 신청할 수 있어요.</li>
        </ul>
    </DocSection>
    <DocSection id="invite" title={titles.invite}>
        <p>
            아래 버튼으로 Discord의 앱 추가 화면을 열고 봇을 추가할 서버를 골라요. 표시된 권한을 확인한 뒤
            <strong>승인</strong>을 눌러요.
        </p>
        <div class="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
            <Button href={BOT_INVITE_URL ?? undefined} disabled={!BOT_INVITE_URL} variant="primary" size="lg">
                서버에 봇 추가
            </Button>
            {#if !BOT_INVITE_URL}
                <p class="mt-0! text-sm text-muted">초대 링크를 준비하고 있어요.</p>
            {/if}
        </div>
    </DocSection>
    <DocSection id="setup" title={titles.setup}>
        <p>
            봇이 들어온 서버의 아무 채널에서 <code>/초기설정</code>을 실행해요. 봇을 제외한 서버 멤버를
            등록하고 첫 시즌을 준비해요. 멤버가 바뀌어도 다시 실행하면 명단이 갱신돼요.
        </p>
    </DocSection>
    <DocSection id="channels" title={titles.channels}>
        <p>
            웹에서 서버를 열고 <strong>관리</strong>에서 모집·엔트리·결과 채널과 운영자 역할을 정해요. 각
            채널에서 봇에게 채널 보기, 메시지 보내기, 메시지 기록 보기 권한이 있어야 게시할 수 있어요.
        </p>
    </DocSection>
    <DocSection id="start" title={titles.start}>
        <p>
            <code>/내전모집</code>으로 제목과 일정을 입력하면 모집 채널에 참가 버튼이 있는 모집 글이 올라가요.
        </p>
    </DocSection>
</DocLayout>
