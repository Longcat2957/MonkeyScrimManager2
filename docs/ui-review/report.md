# 전체 UI 개선 보고서

현재 순차 구현 상태는 [후속 기능 작업표](../remaining-implementation.md)를 따른다. 계정·설정 감사, 서비스 운영자 관리, 탈퇴·공개 설정의1~3단계를 구현·검증했으며 실제 변경·검사·전후 이미지는 [순차 구현 기록](backlog.md)에 정리했다. 새 설정의 hydration 회귀와 열린 선수 상세의 오래된 개인정보도 수정 후 재검증했다. 이전 완료 기록은 [추가 기능 구현·최종 검증](next.md)에 보존한다. 진행 중 내전의 전체 취소·편성 준비 복구, 과거 시즌 전적·통계·순위 선택, DB/ROFL 실제 자원 제한과 안전한 요청 관측을 구현·검증했다. 핵심7종을 검토·재검증하고5종의 UI를 직접 수정했으며, 실제 화면에서 찾은 긴 시즌명·확인창 읽기 폭·취소 대진 안내도 해결했다. 적용 기능은 extract·clarify·harden·adapt·typeset·polish·document이며 관련 파일·선택 근거·전체 검사·88장 이미지는 새 기록에 연결했다. [최종 audit](next-audit.md)은 변경 범위16/20으로 판정했고, 남은 새 차단 문제는 확인하지 못했다.

[운영 과업 실행 기록](operations.md)의 경매 직전 작업 취소·정확 복구·중도 종료/재개·관전자 갱신·시즌 명령·배포 격리 검증, [앞선 디자인·전적 연결](remaining.md)과 아래 기록은 이력으로 보존한다. 약관·개인정보 본문은 사용자 보류이며 실제 Safari·물리 기기·음성 청취·라이브 OAuth·운영 배포는 미검증이다. 새 migration0008은 격리 DB에서만 검증했으며 사용자 개발/운영 DB에는 적용하지 않았다.

아래와 [후속 최종 보고서](followup.md)·[독립 비평](followup-critique.md)은 앞선 개선 당시의 기록을 보존한다. 최초 단계는 전체20URL·80조건, 후속 디자인 단계는 DQ-01~13, 그 다음 전적 연결 단계는 공통 요약·통계·수동 편성·경매4페이지를 다뤘다. 최신7종 검증을 전체20페이지 재촬영으로 집계하지 않는다.

2026-11-14. 대상은 `apps/web`의 운영 18개·개발 전용 2개 화면, 공유 헤더·메뉴·푸터·팝업이다. 실제 URL·역할·상태·전후 이미지는 [coverage.md](coverage.md)에 기록한다. 기존 브랜드, Slate/STDF, 제품 기능·데이터 의미·API·인증·권한 규칙을 유지했다. 백엔드와 외부 API 계약은 변경하지 않았다.

## 진단과 판단 근거

Method: dual-agent (A: `/root/design_review` · B: `/root/technical_review`). A는 detector를 보지 않고 시각·과업을 검토했고, B는 소스·실제 DOM·브라우저 진단을 독립 수행했다. 최종 A 완료 뒤 B 결과를 합쳤다. Questions skipped: 사용자가 문서와 코드에 근거한 자율 수정·재검증을 명시했다.

기존 문서·README·AGENTS와 실제 구현을 먼저 읽어 [PRODUCT.md](../../apps/web/PRODUCT.md)에 확인된 제품 맥락을 정리했다. 새 사업 규칙이나 성과·사용자 주장은 만들지 않았다. 운영 화면은 Operate, 이용 문서는 Read로 판단했다. 기존 워드마크, 챔피언·포지션 이미지, 경기행과 세로 대진의 장점은 유지했다.

기본 화면은 1440×1000·390×844에서 수정 전 촬영했다. 실제 이미지를 읽고 주요 클릭·키보드·모달·실패 조건을 재현한 뒤 수정했다. 전체 20개는 320px에서도 추가 검사했다. document의 가로 넘침이 없더라도 내부 작업판이 잘릴 수 있어 이미지와 실제 자리 배치를 별도로 확인했다.

## 실행 작업 목록과 완료 조건

| ID | 우선순위·범위 | 확인한 근거 | 적용 기능·완료 조건 | 상태 |
| --- | --- | --- | --- | --- |
| UI-01 | P1 수동 편성 | 모바일에서 둘째 팀·자리 잘림, 30/56rem 최소 폭 | adapt·layout·polish: 모든 자리와 선택→배치→교환→해제 접근 | 완료 |
| UI-02 | P1 경매 준비 | 선택 안내·저장·시작이 후보 아래 멀리 위치 | layout·clarify·onboard·distill: 목표·팀장 선택·저장/시작을 먼저 파악 | 완료 |
| UI-03 | P1 통계 | 모바일에서 일곱 지표 중 다섯 개와 정렬 제거 | adapt·layout: 일곱 지표 유지·양방향 정렬·키보드 스크롤 | 완료 |
| UI-04 | P2 정보 위계 | 업적이 운영 현황보다 먼저, 선수 15지표 동일 비중 | distill·quieter·typeset·layout: 현황 먼저, 6핵심+9세부 지표 보존 | 완료 |
| UI-05 | P2 서버 홈 | 지난 일정도 시작까지 0초로 표시 | harden·clarify: 상태를 추정하지 않고 경과 문구·일정 변경·만료 처리 | 완료 |
| UI-06 | P1 공통 선택 | 실제 STDF Tab 버튼에 선택 상태 없음 | extract·harden: 8사용처 aria-pressed·native 키보드·44px | 완료 |
| UI-07 | P2 오류 | 401에 일시 조회 실패 문구 | clarify·harden: 로그인 필요와 단일 로그인 경로 안내 | 완료 |
| UI-08 | P1 공통 요청 | 통신 실패 뒤 복구 재조회도 reject 가능(소스 확인) | harden: 결과 불명·저장 후 갱신 실패 구분, 입력 보존 | 완료 |
| UI-09 | P2 업적·히어로 | 작은 선택 점·어두운 아트 위 약한 상태색 | adapt·colorize·polish: 44px·독립된 바탕·양 테마 대비 | 완료 |
| UI-10 | P2 폼·문서 | 검색 이름 없음, 같은 팀 입력 이름, Input 문서 오류 | clarify·extract·harden·document: 보이는 이름·오류 연결·실제 API 문서 | 완료 |
| UI-11 | P2 공통·개발 | 작은 메뉴/푸터 조작·문서 위계·중복 h1 | typeset·polish·adapt: 공유 영역 포함 단일 h1·읽기 순서·키보드 | 완료 |
| UI-12 | P1 모집 설정 | Calendar 320이 320vh로 해석되어 작업 줄 밀림 | harden·adapt: 공식 높이 32%·내부 스크롤·저장/취소 접근 | 완료 |
| UI-13 | P2 경매 입찰 | 감소는 우클릭만 가능, ± 문구 모호 | adapt·clarify: −50/−10/+10/+50을 키보드·터치로 조작 | 완료 |
| UI-14 | P2 선수 전적 | 최근 아이콘과 목 기록이 같은 게임 URL을 반복 | distill·extract: 모든 기록 보존·목적지 이동은 한 곳 | 완료 |
| UI-15 | P2 대비 | 밝은 상태 배지 4.44:1·placeholder 3.29:1·업적 점 2.31:1 | colorize·harden·polish: 일반 글자 4.5:1·의미 있는 점 3:1 | 완료 |
| UI-16 | P2 계정·개발 | 긴 이름, 예제 파일 선택 미연결·버튼 무응답 | onboard·clarify·harden: 실제 선택·결과·실패→복구·긴 이름 처리 | 완료 |
| UI-17 | P1 서버 관리 | 설정·계정 요청 중 다른 조작 가능, 시트 높이 무제한 | harden·adapt·clarify: 요청 잠금·입력 보존·복구·단일 팝업 | 완료 |
| UI-18 | P2 쪽 이동 | 실제 버튼 40px, 작은 폭에서 너비도 40px | adapt·harden·polish: 44px·DOM 순서·생략 목록·키보드 유지 | 완료 |
| UI-19 | P2 장문·펼침 상태 | 긴 영문 이름 넘침, 펼친 지표 이름 3.86:1·다크 순위 2.16:1 | harden·typeset·colorize: 장문 줄바꿈·불투명 보조색·순위 글자 대비 | 완료 |
| UI-20 | P1 모집 달력 | 빈 칸 Tab 대상·날짜 이름 중복, 요일 열 하루 불일치·선택 후 body 포커스 | harden·adapt·clarify·colorize: 날짜 열 교정·전체 날짜 이름·빈 칸 제외·시각 포커스·선택 상태 | 완료 |
| UI-21 | P2 수동 편성 상태 대비 | 후보 MMR 4.47:1·빈 자리 2.60:1·교환/hover MMR 3.92:1 | colorize·polish: 기존 의미 전경으로 기본·hover·선택·배정 상태 4.5:1 이상 | 완료 |

UI-08의 전체 화면 고정은 초기 추정이었다. 실제 재현에서는 1POST·0강제 재조회와 입력·URL 유지가 확인됐으며, 추정을 재현 사실로 바꾸지 않았다. 실제 기기·보조기기·운영 계정 검증 범위도 아래에 구분한다.

## 묶음별 변경과 검증

### 공통 원인

- [SelectionTabs](../../apps/web/src/lib/components/common/SelectionTabs.svelte)는 STDF 공식 옵션·native 버튼을 유지하고 선택 상태·type·44px를 보완했다. 8사용처의 16그룹, Enter/Space 32회·Tab 16회 통과. [근거](../../artifacts/ui-review/selection-tabs-validation.json).
- [AccessibleAccordion](../../apps/web/src/lib/components/common/AccessibleAccordion.svelte)은 FAQ·경매 기록·선수 세부 지표에서 사용한다. 펼침 상태·존재하는 패널 연결·접힘 중 inert·reduced-motion을 제공한다. [96회 키보드 검증](../../artifacts/ui-review/accordion-validation.json).
- [form.ts](../../apps/web/src/lib/ui/form.ts)의 실제 반복만 추출했다. inputFeedback은 오류 연결, inputLabel은 STDF label 내부 clear로 바뀌는 입력 이름과 한국어 44px 지우기, stepperLabels는 필드별 증감 이름을 담당한다. 지우기가 있는 검색·날짜 사용처를 이관했다. nonSubmitButtons는 한글 조합 중 Enter의 잘못된 제출도 막는다.
- [actions.ts](../../apps/web/src/lib/ui/actions.ts)는 통신 실패 때 자동 재전송·강제 재조회를 하지 않아 작업을 보존한다. 저장 성공 뒤 갱신 실패와 저장 결과 불명을 구분한다. SectionState는 겹치는 재시도·거부된 요청을 finally로 종료한다.
- 공유 헤더·메뉴·푸터 조작을 보완하고 모바일 로그인은 헤더 한 곳으로 모았다. 실제 인증과 개발 미리보기 사용자를 구분한다. 401·403·404·500 안내·제목·noindex를 검증했다.
- [layout.css](../../apps/web/src/routes/layout.css)에 기존 다크 의미색을 재사용한 inverse-surface와 불투명 text-muted를 정리했다. 밝은 success/warning은 기존 팔레트의 더 짙은 단계다. 다크·고정 어두운 히어로의 밝은 의미색은 유지했다. [히어로 12조건](../../artifacts/ui-review/inverse-validation.json), [색상·포커스 측정](../../artifacts/ui-review/contrast-validation.json).

### 공개 4개: 소개·이용 문서·약관·개인정보

소개 문구의 반복과 잘못된 preload-data 값을 정리했다. 문서 목차는 모바일 2열·44px, 긴 경매 안내는 과업별 목록과 현재 입찰 버튼에 맞췄다. FAQ·메뉴·테마 저장·푸터 이동을 검증했다. 약관·개인정보의 준비 중 원문은 유지했다. 4URL×두 폭×두 테마 16조건 모두 실제 이미지 검토, 브라우저 오류·경고 0. [근거](../../artifacts/ui-review/public-validation.json).

### 내전 운영 5개: 요약·수동·경매·대진·결과

- 수동 작업판은 미배정→팀 자리 순서와 모바일 한 열/넓은 화면 두 열로 바꿨다. 상세 시너지·상대 기록도 좁은 화면 안에 배치했다. 배치·교환·해제, 연속 클릭 1POST, 실패 복구, 마지막 항목 키보드 접근을 통과했다.
- 경매 준비는 목표·막힌 이유·저장/시작을 먼저 보여준다. 팀별 입력 이름·오류·처리 잠금, 같은 내전 재조회 시 미저장 설정을 보존한다. 입찰은 네 개의 명시적 증감 버튼을 제공한다. 0점 낙찰·예산 상한·새 후보의 이전 입찰 초기화·읽기 전용 완료·reduced-motion을 검증했다. 안내 타이머는 리셋 직후에도 0~10초로 제한하며 낙찰 규칙을 바꾸지 않는다.
- 대진은 작업 제목·팀 선택 안내를 먼저 제시하고 결과/중도 종료 제목을 구분한다. 선택→배치→해제·동시 요청 잠금·실패 후 원래 풀 복구를 통과했다.
- 모집 생성·설정·신청은 실패 후 값·포커스를 유지한다. 열린 Popup 위치를 고정하고 Calendar를 공식 단위로 수정했다. 세 폼×두 폭의 실패 6조건, 12개 POST 가로채기, 합성 성공 뒤 후속 조회 대기, 합성 IME·Escape 차단·열린 창 resize를 검증했다. 실제 저장·봇 발송은 하지 않았다.
- 기본·상세·역할·상태를 390·768·1024·1440px에서 확인하고 개발 편성/경매를 원래 상태로 복원했다. [팀 운영](../../artifacts/ui-review/workflow-team-validation.json), [대진](../../artifacts/ui-review/bracket-validation.json), [역할·읽기 전용](../../artifacts/ui-review/workflow-readonly-validation.json), [폼](../../artifacts/ui-review/forms-validation.json).

주요 파일은 `components/teams/`의 ManualFormationBoard·FormationPool·FormationSynergyRail·FormationHeadToHead·AuctionSetupBoard·AuctionDraftBoard·AuctionTeamCard, `components/bracket/`, `components/scrims/`의 설정·신청·운영 조작이다.

### 데이터 4개: 서버 홈·내전 목록·경기 목록·통계

홈의 순서는 다음 내전→활동·순위→업적이다. 지난 일정과 실제 상태를 구분하며 일정 변경·카운트다운 만료를 처리한다. 업적은 자연 높이·카드 밖 조작·44px 선택과 단일 가로 터치를 사용한다. 통계 표는 일곱 지표를 보존하고 KDA·승률 우선, 고정 이름 열·이름 있는 키보드 가로 스크롤·단일 aria-sort·변경 안내를 제공한다. 검색·필터 갱신은 기존 결과와 aria-busy를 유지한다. 의미를 반복한 KPI note 세 개를 제거했다.

4URL×두 폭×두 테마 16장과 추가 상태 이미지를 실제 읽었다. 768px, 빈 서버, 긴 텍스트, 일곱 정렬 양방향, 검색 지우기, 느린 조회·실패·재시도, 팝업 resize, 일정 변경·만료를 통과했다. [근거](../../artifacts/ui-review/data-validation.json). 관련 파일은 `components/guild/`, `components/stats/`, `routes/g/[guildId]/{+page,scrims,matches,stats}`다.

### 계정·운영·개발·오류 4개

계정의 긴 이름·서버명·Riot ID와 빈 상태를 정리했다. 백오피스 재확인은 중복을 막고 새 상태 조회 완료까지 대기한다. 알려진 오프라인에서는 기존 정보를 유지하며 동일 버튼으로 복구한다. 개발 예제는 실제 파일 선택·삭제·제한, 동작 결과, 실패→재시도, 입력 오류·포커스·단일 트리, 별도 앵커 이동을 제공한다. ScrimSummary는 실제 h1과 예제 h3를 구분한다.

기본 16장+상태 13장=29장을 실제 읽었다. 401·403·404·500, 계정 빈 상태·긴 이름, 파일 선택, 재시도 실패·복구, 폼 resize, 오프라인/온라인 복구와 0페이지 예외를 확인했다. `__data`만 차단하면 SvelteKit이 문서 재탐색으로 정상 복구함을 확인했으며 이를 오류 안내 실패로 오기하지 않는다. [근거](../../artifacts/ui-review/account-validation.json). 관련 파일은 `routes/{me,backoffice,dev/components}`, RiotAccountList, ScrimSummary, 공통 오류 화면이다.

### 상세·관리 3개와 최종 공통 보완

선수 전적은 계산과 15개 수치를 보존한 채 6핵심+9세부 지표로 나눴다. 최근 띠는 정적 요약이며 모든 기록 행을 유지하고 같은 게임 URL은 한 번만 연결한다. 긴 이름·Riot ID와 범위를 벗어난 쪽의 빈 안내·1쪽 복구, 지연 중 기존 기록 보존을 검증했다. LinkCell은 이 목적의 정적 변형을 지원한다.

경기 상세는 팀 이름과 시리즈 점수를 h1 하나에 합쳤다. 상태 배지 조상의 opacity를 제거하고 진영 머리의 작은 글자를 보정했다. 모바일 표는 유지하면서 44px 상세에서 모든 세부 수치를 확인한다. 열린 선수 팝업의 390→1440→768→390 전환·단일 트리·Escape 복귀, 세트 선택·완료·중도 종료·빈 세트를 확인했다.

손상 ROFL의 실제 422 응답은 파일을 보존해 같은 버튼으로 재시도한다. 지연 중 연속 클릭은 1POST, 닫기/Escape 차단, 응답 유실은 재전송 중단·닫은 뒤 현재 상태 확인을 통과했다. 두 폭의 실제 실패 네 장을 읽었다. 경기 결과는 변경하지 않았다. [상세](../../artifacts/ui-review/detail-validation.json), [장문·지연·빈 쪽·지우기](../../artifacts/ui-review/detail-extra-validation.json), [ROFL 실패](../../artifacts/ui-review/upload-validation.json).

일반 표면의 마지막 대비 검사는 펼친 선수 지표까지 포함했다. 라이트·다크 10조건의 950표본에서 의미 있는 작은 글자의 실패는 0이며, 별도 전체 이름 옆의 장식 이니셜 22표본은 구분한다. 이미지·그라데이션·큰 글자 전체를 이 측정으로 인증하지 않는다. [방법·원값](../../artifacts/ui-review/final-flat-validation.json).

서버 관리는 Discord 설정 전체의 저장 잠금과 finally, 계정 조회·연결·대표·해제의 단일 처리 상태·오류 연결·입력 보존·포커스·44px·시트 높이·열린 동안 위치 고정을 보완했다. 개발 샘플 invalid(0POST),404/503,link409 뒤 재시도·연결/해제 복원, 대표 변경/복원, 중복1POST·전송 실패·403·크기 전환을 확인했다. [실패·잠금·Discord 재검증](../../artifacts/ui-review/admin-validation.json).

PageNav는 STDF7/5개 표시를 유지하며44px·DOM 순서의 균형 줄바꿈을 제공한다. 미지원 브라우저는 일반 wrap으로 대체한다. 네이티브 생략 목록은 자르지 않고 실제 트리거 위치에 맞추며 이름·현재/펼침 상태·Escape 복귀를 보완했다. 실제6사용처24조건,100쪽3조건, 열린 목록의320→390→768→1440→320 전환을 통과했다. [근거](../../artifacts/ui-review/pagination-validation.json).

### 최종 감사에서 찾은 상태 보완

모집 달력은 빈 칸도 Tab 대상이고 월마다 같은 날짜 이름을 반복했다. 실제 한국어 요일은 월요일 시작 날짜 열보다 하루 어긋났다. 루트 `ConfigProvider`의 공식 locale 배열을 교정하고 `ScrimSettingsDialog`의 좁은 attachment로 빈 칸 비활성·전체 날짜 이름·선택 상태·월 제목 대비를 보완했다. 선택 뒤 시각 입력으로 포커스를 이어 준다. 생성8조건·수정4조건의 양 테마·1440/390/720/320px에서 접근 가능한 이름 누락0, 날짜 선택→재열기·선택 상태·기존 폐기 확인·포커스 복귀, 84개 월의 첫 날짜 열 일치를 통과했다. 추가12장도 실제 읽었다. [달력 전후·원값](../../artifacts/ui-review/calendar-validation.json), [확대에 해당하는 레이아웃 감사](../../artifacts/ui-review/zoom-validation.json). 720×500은 200% 유효 CSS 폭의 모사이며 브라우저 UI의 실제 확대 검증과 구분한다.

수동 편성의 후보·빈 자리와 배정 선수 MMR은 기본·hover·교환 표면을 따로 측정했다. 기존 보조 글자 토큰을 재사용하고, 더 밝은 다크 hover 배경 위 배정 MMR에는 기존 `dark` 전경을 사용한다. 비활성 미래 단계의 STDF 표현과 별도 숨긴 진행 목록은 유지했다. [상태별 대비 재검증](../../artifacts/ui-review/manual-contrast-validation.json). 16개 상태 조건에서 라이트 최소6.15:1·다크 최소4.95:1을 확인했다. 개발 원본6/10을 바꾸지 않고 기본 네 장도 정상 초기 화면에서 다시 촬영·실제 읽고 해시를 갱신했다.

## 최종 검사·재평가

- 웹 기존 테스트 415/415, 봇 65/65, 실제 세션·격리 DB 브라우저 테스트 7/7 통과. 테스트 타입 검사도 통과했다.
- Svelte 검사 0오류·0경고. 모노레포 재귀 check와 build를 통과했다. 최종 pnpm check의 포맷·브랜딩·봇 TypeScript·Svelte 검사를 모두 통과했다. 마지막 달력·대비 보완 뒤에도 같은 검사를 재실행했다. 전체20URL·두 폭·두 테마80조건은 h1·넘침·입력 이름·ID·브랜드 검사를 통과했고, 예상403 리소스 오류 외 페이지 JS 예외0이다. 전후 기본120장 모두 실제 이미지를 읽었다.
- 기본 MCP의 Chrome 경로 누락은 설치 Chromium을 지정한 같은 Playwright MCP 0.0.85의 stdio 연결로 복구했다. 일반 브라우저 스크립트 대체를 MCP 수행으로 혼동하지 않는다. 공식 Svelte MCP가 도구 목록에 없어 공식 문서와 설치 컴파일러·svelte-check를 사용했다.
- 초기 주관 평가 26/40, 독립 최종 A는 31/40(Good)이다. 완성 인증이나 성능 개선율이 아니다. [독립 최종 A](../../artifacts/ui-review/final-assessment-a.md). 최종 B 기술 감사는 확인 범위 내18/20이며 [분류·원값·한계](../../artifacts/ui-review/final-assessment-b.md)를 별도로 남겼다. 실제 개선 가능한 추가 P2를 수정·재검증하고 새로운 취향 변경은 멈춘다.
- doctor의 앱 대상 검사에서 findings는 빈 배열, rule registry 사용 가능이었다. 실제 토큰과 검증한 규칙을 [DESIGN.md](../../apps/web/DESIGN.md)·[schema2 sidecar](../../apps/web/.impeccable/design.json)와 기존 디자인 시스템·패턴·모든 페이지 문서에 병합했다. 재실행한 doctor도 두 파일을 인식하고 findings가 빈 배열이다. [최종 doctor 원문](../../artifacts/ui-review/doctor.json).

[최종 명령·테스트 수·소스 해시](../../artifacts/ui-review/checks.json). CLI28건은 진영 경계1·기존 완료 easing2·기존 보조 크기24·치환 전 app.html 기본색1로 분류한다. 새로운 확인 결함 수와 합산하지 않는다. [원문](../../artifacts/ui-review/final-detector.json). 최종 독립 감사에서 추가된 실제 UI21은 수정 뒤16조건에서 통과했다.

## 남은 범위와 한계

1. `/terms`·`/privacy`의 승인된 정책 본문·적용일·문의 경로는 제공되지 않았다. 준비 중 원문을 유지했으며 사실·법적 문구를 임의 작성하지 않는다.
2. 물리 모바일·Safari·실제 스크린리더 낭독·실제 IME는 미검증이다. Chromium 키보드·TouchEvent/실제 touchscreen.tap·합성 조합 이벤트 검증과 구분한다.
3. 실운영 OAuth·Discord 발송·실계정 쓰기·정상 ROFL의 실제 운영 업로드는 수행하지 않았다. 실제 세션과 계정 연결 계약은 격리 DB 브라우저 회귀에서 확인했다.
4. 요청 도중 모든 연결이 끊어지는 조건은 SvelteKit의 문서 재탐색 때문에 브라우저 네트워크 화면으로 이탈할 수 있다. 백오피스의 알려진 오프라인은 사전 안내로 처리하며 새 API·오프라인 저장 계약은 만들지 않았다.
5. [현재 성능 관찰](../../artifacts/ui-review/performance-observations.json)은 개발 서버·390px·헤드리스·무제한 네트워크의4회 방문이며 longtask 관찰0을 기록했다. 실제 사용자 성능·실기기 CWV 전후 측정은 하지 않았다. 측정되지 않은 속도·개선율을 보고하지 않는다. 모바일 실시간 경매의 긴 페이지는 과업 실패가 재현되지 않은 후속 사용성 연구 후보이며 확정 결함으로 세지 않는다.

## 최종 증거와 도구 범위

전체 URL·테마·역할·스크린샷·미검증 조건은 coverage.md에 연결했다. 설치된 스킬과 로컬 훅의 생성 산출물은 생성기 형식을 보존하도록 .prettierignore에 좁게 제외하고 직접 관리 코드·증거 JSON은 정렬한다. 개발 서버는 사용자가 결과를 확인할 수 있도록 유지하며, 진단 전용 live-server는 종료한다. detector의 알려진 정보 경계선·완료 easing 신호는 실제 의미와 동작 줄이기 검증을 근거로 해석하며, 기계 경고0을 완료 조건으로 삼지 않는다.


## Stop 훅 후속 분류

2026-11-14: `GameHero.svelte:34`의 `side-tab`은 승리 진영을 나타내는 기존 파랑·빨강 경계이며 같은 진영의 승리 문구를 보조한다. 최종 A/B 검토와 실제 `winner.side` 분기를 근거로 Codex가 의도된 도메인 표현으로 판단했다. 사용자 확인을 받은 선택으로 기록하지 않는다. UI 코드는 변경하지 않았다.

공식 `hooks ignore-value`로 해당 파일의 `side-tab`만 `value="*"` 예외를 영속화했다. 프로젝트 전체 규칙·파일 제외는 추가하지 않았다. 파일 재검사는 `[]`·종료0이었다. 기존28건 원문과 스냅샷은 예외 등록 전 진단으로 보존한다. [분류·검증](../../artifacts/ui-review/hook-triage.json).
