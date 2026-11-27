<script lang="ts">
    import { SERVICE_NAME } from '#lib/branding.ts';
    import AccessibleAccordion from '#lib/components/common/AccessibleAccordion.svelte';
    import DocLayout from '#lib/components/docs/DocLayout.svelte';
    import DocSection from '#lib/components/docs/DocSection.svelte';
    import { docHeadings } from '#lib/components/docs/toc.ts';

    // 모든 장을 한 문서로 이어 읽는다. 장 링크(#id)는 공유·뒤로 가기·인쇄를 브라우저 기본 동작에 맡긴다.
    const titles = {
        recruit: '모집 참여',
        teams: '팀 편성',
        bracket: '대진',
        rofl: 'ROFL 업로드',
        operations: '되돌리기·중도 종료',
        faq: '자주 묻는 질문'
    };
    const sections = docHeadings(titles);

    const FAQ = [
        {
            q: '진영이나 순서를 무작위로 고를 수 있나요?',
            a: '서버 메뉴의 미니게임에서 코인토스, 사다리, 룰렛을 사용할 수 있어요. 추첨 결과는 내 화면에만 표시돼요. 실제 경기의 블루·레드 팀은 대진 화면에서 따로 정해 주세요.'
        },
        {
            q: 'ROFL을 올렸는데 기록되지 않았어요.',
            a: '업로드 창의 파일 칸에 이유가 표시돼요. 파일이 손상됐거나 출전자·포지션·팀·승패를 확인할 수 없으면 기록하지 않아요. 경기 상태가 바뀌었거나 연결이 끊겼다면 창을 닫은 뒤 경기 화면에서 실제로 기록됐는지 확인해 주세요.'
        },
        {
            q: '같은 파일을 두 번 올리면 어떻게 되나요?',
            a: '같은 결과를 중복으로 기록하지 않아요. 이미 등록된 파일이라는 안내가 나오면 경기 화면에서 저장된 세트를 확인해 주세요. 마지막 세트를 취소했다면 새로고침 후 같은 세트에 같은 파일을 다시 올려 복구할 수 있어요.'
        },
        {
            q: '승패를 직접 입력할 수는 없나요?',
            a: '결과는 ROFL 파일로만 기록해요. 직접 입력으로 결과를 바꾸는 기능은 없어요.'
        },
        {
            q: '하드 피어리스에서 이미 쓴 챔피언을 골랐어요.',
            a: '경기 화면에 피어리스 표시가 붙고 다음 세트에서 쓸 수 없는 챔피언 목록에 안내돼요. 업로드나 결과 기록은 막지 않아요.'
        },
        {
            q: '선발이 아니라 대기로 표시돼요.',
            a: 'Discord 모집 글의 ‘대기 신청 / 시각 변경’을 열면 버튼을 누른 날짜와 시각이 한국 시간으로 채워져요. 예정 시작보다 늦은 합류 시각으로 바꿔 제출해 주세요. 모집 중 합류 시각에 선발 자리가 있으면 자동으로 이동하고, 만석이면 자리가 날 때까지 대기해요. 일반 참가 신청으로 대기가 된 경우에는 운영자가 배정해요.'
        }
    ];
</script>

<svelte:head>
    <title>이용 안내 | {SERVICE_NAME}</title>
</svelte:head>

<DocLayout title="이용 안내" {sections}>
    <DocSection id="recruit" title={titles.recruit}>
        <p>
            Discord 모집 글의 <strong>참가하기</strong> 버튼으로 바로 신청할 수 있어요. 웹 사전 가입이나 Riot 계정
            연결은 필요하지 않아요.
        </p>
        <ol>
            <li>웹에서는 로그인한 뒤 서버의 <strong>내전</strong> 메뉴에서 참가할 내전을 열어요.</li>
            <li>
                <strong>신청하기</strong>에서 희망 포지션을 고르고 신청해요. 연결된 Riot 계정이 있으면 함께
                선택할 수 있어요.
            </li>
            <li>
                모집이 끝나기 전까지는 <strong>내 신청</strong>에서 계정·포지션을 바꾸거나 신청을 철회할 수
                있어요.
            </li>
        </ol>
        <p>신청하면 선발 자리가 남아 있을 때 바로 선발되고, 다 찼으면 대기가 돼요.</p>
    </DocSection>
    <DocSection id="teams" title={titles.teams}>
        <p>
            운영자가 내전 화면의 <strong>편성 방식</strong>에서 수동 편성과 경매 중 하나를 골라요. 모집 중에
            미리 골라 둘 수 있고, 팀 편성을 확정하기 전까지 바꿀 수 있어요. 편성을 시작한 뒤 방식을 바꾸면
            기존 배치나 경매 결과의 적용을 해제하고 새 방식으로 다시 준비해요.
        </p>
        <p>
            방식을 고르면 내전 제목 아래 <strong>팀 편성</strong> 메뉴를 사용할 수 있어요. 모집을 마감하면 해당
            작업판으로 이동하며, 참가자도 여기서 진행 상황을 볼 수 있어요. 팀 이름은 포로팀·칼날부리팀처럼 자동으로
            붙어요.
        </p>
        <h3>수동 편성</h3>
        <p>
            운영자가 참가자를 팀의 포지션 자리로 끌어 놓거나, 참가자를 누른 뒤 자리를 눌러 배치해요. 자리에
            사람이 있으면 서로 바뀌어요. 모두 배치하고 <strong>편성 확정</strong>을 누르면 대진 화면으로
            이동해요. 2팀 내전도 여기서 바로 시작하지 않아요.
        </p>
        <h3>경매</h3>
        <p>
            운영자가 팀장과 팀별 시작 포인트를 정한 뒤 경매를 시작해요. 후보가 한 명씩 올라오면 팀마다
            입찰가를 정해 낙찰하거나 유찰해요.
        </p>
        <ul>
            <li>
                입찰가는 직접 입력하거나 <strong>−50</strong>·<strong>−10</strong>·<strong>+10</strong
                >·<strong>+50</strong>
                버튼으로 조정해요.
            </li>
            <li>
                현재 후보는 팀으로 끌거나 후보 목록의 <strong>수동 배치</strong>로 가격 없이 배치할 수 있어요.
            </li>
            <li>유찰된 후보도 후보 목록에서 다시 올리거나 팀에 바로 배치할 수 있어요.</li>
        </ul>
        <p>모든 팀이 다 차면 경매가 끝나고 대진 화면으로 이동해요.</p>
    </DocSection>
    <DocSection id="bracket" title={titles.bracket}>
        <p>
            경매 대진에서는 팀을 1세트 블루·레드 자리에 끌어 놓거나, 팀을 선택한 뒤 자리를 눌러요. 같은 경기의
            반대 자리로 옮기면 두 팀의 진영이 바뀌어요. 수동 편성은 양 팀을 배치한 뒤 블루 팀을 골라요.
            라운드별 경기 방식을 정하고 <strong>대진 확정·내전 시작</strong>을 눌러요.
        </p>
        <ul>
            <li>2팀은 결승 한 경기예요.</li>
            <li>4팀은 준결승 두 경기의 승자끼리 결승을 치러요.</li>
        </ul>
        <p>진출 팀이 정해진 결승이나 다음 세트의 블루 팀은 경기 상세에서 정해요. 나머지 팀은 레드예요.</p>
        <p>
            내전이 끝나면 <strong>결과</strong> 메뉴에서 경기별 점수와 진출 결과를 볼 수 있어요. 한 경기로 끝난
            내전은 기록된 세트가 있는 경기 상세로 바로 이동해요.
        </p>
    </DocSection>
    <DocSection id="rofl" title={titles.rofl}>
        <p>
            수동 편성에서 확정한 팀·포지션은 경기에 자동 적용돼요. 경매는 운영자가 경기 화면에서 출전 라인업을
            한 번 확정해요. 한 경기의 모든 세트는 같은 라인업을 사용하며, 서버 관리자와 그 경기에 확정된
            출전자가 결과를 등록할 수 있어요.
        </p>
        <ol>
            <li>세트가 끝나면 League of Legends 클라이언트에서 리플레이 파일(.rofl)을 저장해요.</li>
            <li>
                <strong>경기 기록</strong>에서 진행 중인 경기를 열고 <strong>ROFL 업로드</strong>를 눌러요.
            </li>
            <li>표시된 세트 번호를 확인해요. 예정된 블루 팀이 비어 있거나 실제 진영과 다르면 바로잡아요.</li>
            <li>
                해당 세트의 파일 하나를 고르고, 표시된 블루·레드 팀이 맞는지 체크한 뒤
                <strong>업로드</strong>를 눌러요. 파일은 64MB 이하여야 해요.
            </li>
        </ol>
        <p>
            정상 파일은 승인 없이 바로 기록되고, 한 팀이 과반을 이기면 경기가 끝나요. 원본 파일은 보관하지
            않아요.
        </p>
        <p>
            첫 ROFL 결과를 기록할 때 확정 출전 정보와 선택한 블루 팀을 기준으로 Riot 계정이 연결돼요. 서버별
            연결 계정은 <strong>내 정보</strong>에서 확인할 수 있어요.
        </p>
    </DocSection>
    <DocSection id="operations" title={titles.operations}>
        <p>
            경기 시작 전에는 대진 화면에서 팀 편성을 다시 열 수 있어요. 대진과 진영 선택은 해제되지만 수동
            배정은 그대로 남아요. 경매도 팀장·영입·잔여 포인트를 유지해요. 마지막 영입을 잘못했다면 경매
            화면에서 직전 작업을 되돌리세요. 변경할 내용이 없으면 <strong>경매 편성 확정</strong>으로 대진에
            돌아가세요.
        </p>
        <p>
            모집까지 다시 열면 편성 방식만 유지하고 기존 배정은 지워요. 다른 단계로 돌아갈 때는 다음 차이를
            확인하세요.
        </p>
        <ul>
            <li>
                <strong>방식 다시 고르기</strong>: 지금까지의 편성을 지우고 편성 방식 선택으로 돌아가요. 수동
                편성과 경매(준비·진행 중) 모두에서 쓸 수 있어요.
            </li>
            <li>
                <strong>팀장 다시 정하기</strong>: 진행 중인 경매의 낙찰·유찰·수동 배치를 되돌리고 팀장·시작
                포인트 설정으로 돌아가요. 지금 설정은 남아 있어 고친 뒤 다시 시작하면 돼요.
            </li>
        </ul>
        <p>
            남은 경기를 치르지 않고 끝내려면 <strong>중도 종료</strong>를 써요. 5전 3선승 결승을 1:1에서
            끝내도 기록된 세트와 점수는 전적에 남고, 승자는 정하지 않아요. 잘못 끝냈다면
            <strong>진행 중으로 되돌리기</strong>로 다시 열 수 있어요.
        </p>
        <p>
            마지막 세트의 결과를 고치려면 경기 화면에서 <strong>마지막 세트 취소</strong>를 사용해요. 이후
            경기나 점수 변경 때문에 취소할 수 없다면 이유가 표시돼요. 취소한 기록은 남고, 올바른 결과의 새
            ROFL 파일을 등록하면 같은 세트 번호로 기록돼요. 같은 파일을 복구할 때는 기존에 기록한 블루 팀을
            유지해야 해요.
        </p>
    </DocSection>
    <DocSection id="faq" title={titles.faq}>
        <div class="mt-3">
            <AccessibleAccordion items={FAQ.map((item) => ({ title: item.q }))} border="solid">
                {#snippet children(_item: unknown, index: number)}
                    <p class="mt-0! pb-3 text-sm">{FAQ[index]?.a}</p>
                {/snippet}
            </AccessibleAccordion>
        </div>
    </DocSection>
</DocLayout>
