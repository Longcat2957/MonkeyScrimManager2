<script lang="ts">
    import { CONTACT_EMAIL, SERVICE_NAME } from '#lib/branding.ts';
    import DocSection from '#lib/components/docs/DocSection.svelte';
    import PolicyDocument from '#lib/components/docs/PolicyDocument.svelte';
    import { docHeadings } from '#lib/components/docs/toc.ts';

    const titles = {
        scope: '제1조 서비스의 범위',
        access: '제2조 열람과 참가',
        replays: '제3조 리플레이 등록과 전적 정정',
        conduct: '제4조 이용자가 지켜야 할 사항',
        restrictions: '제5조 이용 제한과 이의 제기',
        changes: '제6조 중단·변경과 책임',
        withdrawal: '제7조 탈퇴, 약관 개정과 분쟁'
    };
    const sections = docHeadings(titles);
</script>

<svelte:head>
    <title>이용약관 | {SERVICE_NAME}</title>
</svelte:head>

<PolicyDocument title="이용약관" {sections}>
    <DocSection id="scope" title={titles.scope}>
        <p>
            {SERVICE_NAME}은 Discord 서버에서 리그 오브 레전드 내전을 모집하고 팀, 대진, 경기 결과와 전적을
            관리하는 서비스입니다. 이 약관은 웹을 방문하는 사람, Discord에서 참가하는 사람, 내전을 개설하거나
            관리하는 사람에게 각자가 이용하는 기능의 범위에서 적용됩니다.
        </p>
        <p>
            서버 관리자는 소속 서버의 모집·선발·편성·결과 정정을 맡습니다. 서비스 운영팀은 계정과 시스템을
            관리하고 권리 침해 신고를 받습니다. 운영팀은 Discord 또는 Riot Games를 대리하지 않으며, 게임
            계정이나 게임 내 제재를 결정하지 않습니다.
        </p>
    </DocSection>
    <DocSection id="access" title={titles.access}>
        <p>
            활성 서버의 공개 화면은 로그인이나 서버 소속 없이 열람할 수 있습니다. 참가 신청은 해당 서버의 실제
            멤버만 할 수 있습니다. Discord에서 신청할 때는 웹 사전 가입이나 Riot 계정 연결이 필요하지
            않습니다. 서버 관리자는 멤버를 대신해 신청할 수 있으며, 본인이 원하지 않은 신청은 해당 관리자에게
            철회나 정정을 요청할 수 있습니다.
        </p>
        <p>
            모집 정원과 마감, 대기 상태, 선발 및 편성 결과를 확인하세요. 신청은 출전 확정이 아니며, 희망
            포지션은 실제 출전 포지션과 다를 수 있습니다. 늦게 합류할 때 입력하는 도착 예정 시각은 한국
            표준시(KST) 기준입니다. 참가가 어려워지면 철회하거나 관리자에게 알려 다른 멤버가 참가할 수 있도록
            해 주세요.
        </p>
    </DocSection>
    <DocSection id="replays" title={titles.replays}>
        <p>
            서버 관리자 또는 확정 출전자는 해당 세트의 실제 리플레이(ROFL)만 등록할 수 있습니다. 등록 전
            경기·세트·블루 팀과 미리보기에 나온 선수 및 결과를 확인하세요. 검증을 통과한 결과는 별도 승인 없이
            전적과 포지션별 평점(MMR)에 반영됩니다. 확인된 실사용 Riot 계정은 해당 서버에서 출전자와 연결될 수
            있습니다.
        </p>
        <p>
            결과나 출전자 연결이 잘못됐다면 서버 관리자에게 경기 링크, 세트 번호와 잘못된 부분을 알려 주세요.
            관리자는 후속 경기나 평점 변경에 미칠 영향을 확인한 뒤 정정 가능한 마지막 세트를 취소하고 올바른
            파일을 다시 등록할 수 있습니다. 원본 파일은 서비스에서 내려받을 수 없으므로 재등록이 필요하면 직접
            준비해야 합니다.
        </p>
    </DocSection>
    <DocSection id="conduct" title={titles.conduct}>
        <ul>
            <li>타인을 사칭하거나 권한 없이 다른 사람의 계정, 서버 또는 운영 기능을 사용하지 마세요.</li>
            <li>다른 경기의 파일을 제출하거나 출전자·진영·결과를 속여 전적이나 평점을 조작하지 마세요.</li>
            <li>공개 전적이라도 괴롭힘, 신상 추적, 비공개 정보 재식별 또는 무단 유포에 사용하지 마세요.</li>
            <li>
                서비스를 마비시키는 요청이나 악성 파일을 보내지 말고 Discord와 Riot Games의 이용 규칙을
                준수하세요.
            </li>
        </ul>
        <p>
            파일 제출은 운영팀이 해당 경기를 검증하고 전적을 표시하는 데 필요한 범위의 이용을 허용하는 것이며,
            원본의 권리를 넘기는 것이 아닙니다. 다른 사람의 개인정보나 제출할 권한이 없는 자료를 올리지
            마세요.
        </p>
    </DocSection>
    <DocSection id="restrictions" title={titles.restrictions}>
        <p>
            권리 침해, 결과 조작 또는 서비스 장애가 확인되면 운영팀은 피해를 막는 데 필요한 범위에서 게시나
            접근을 제한할 수 있습니다. 가능한 경우 당사자에게 사유를 알리며, 긴급하게 먼저 조치한 경우에는
            이후 설명합니다.
        </p>
        <p>
            서버의 선발·편성에 관한 이의는 해당 서버 관리자에게, 서비스 이용 제한 또는 권리 침해에 관한 이의는
            운영팀({CONTACT_EMAIL})에 보내 주세요. 확인할 서버·경기와 이의 사유를 적으면 관련 기록을 검토해
            조치 여부와 이유를 답합니다.
        </p>
    </DocSection>
    <DocSection id="changes" title={titles.changes}>
        <p>
            점검이나 보안 조치, Discord·Riot Games의 장애 또는 정책 변경으로 일부 기능을 일시적으로 제공하지
            못할 수 있습니다. 예정된 중단이나 서비스 종료는 그 범위와 시기를 미리 안내하고, 사전 안내가 어려운
            장애는 확인한 뒤 알립니다. 전적과 시즌 통계는 확인된 경기 자료를 기준으로 하며 게임사의 공식
            순위가 아닙니다.
        </p>
        <p>
            운영팀과 이용자는 각자의 책임 있는 행위로 상대방에게 발생한 손해에 대해 관계 법령에 따른 책임을
            집니다. 이 약관은 법령상 이용자의 권리나 운영팀의 책임을 배제하지 않습니다.
        </p>
    </DocSection>
    <DocSection id="withdrawal" title={titles.withdrawal}>
        <p>
            이용자는 내 정보에서 탈퇴할 수 있습니다. 진행 중인 참가나 서비스 운영 권한은 먼저 정리해야 합니다.
            탈퇴는 이미 끝난 경기의 결과를 취소하지 않습니다. 삭제되는 항목과 남는 기록은 개인정보
            처리방침에서 확인할 수 있습니다.
        </p>
        <p>
            약관을 변경할 때는 변경 내용·사유·시행일을 적용 전에 웹에 게시합니다. 이용자에게 불리한 변경은
            원칙적으로 30일 전에 안내합니다. 동의하지 않는 이용자는 이용을 중단하거나 탈퇴할 수 있습니다.
            분쟁에는 대한민국 법령을 적용하며, 협의로 해결되지 않으면 관계 법령이 정하는 관할 법원에서 다툴 수
            있습니다.
        </p>
    </DocSection>
</PolicyDocument>
