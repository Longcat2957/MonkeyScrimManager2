# 전체 화면 검토 범위

현재 진행 범위는 [미구현 기능의 순차 구현](../remaining-implementation.md)을 따른다. 이전 완료 범위는 [추가 기능 구현·최종 검증](next.md)과 아래 표에 보존한다. [운영 과업 실행 기록](operations.md)·[앞선 남은 과업 기록](remaining.md)·최초20페이지 검토·후속6페이지 DQ-01~13·[당시 부분 충족 판정](recheck.md)은 이력으로 보존한다. 약관·개인정보2페이지는 본문 미확정으로 사용자 요청에 따라 보류했다.

2026-11-14. 기준 주소: `http://127.0.0.1:5173`. 운영 18개 + 개발 전용 2개 = 전체 20개 화면. HTTP API·OAuth 핸들러는 별도 페이지로 세지 않는다.

## 순차 구현의 추가 확인 범위

서버 관리1종에 변경 이력과 빈/긴 이름/다량 이력/범위 밖 쪽을 추가했다. 실제 관리자1440×1000·390×844·양 테마의 DB/HTTP/키보드·메뉴·쪽 이동을 재검증했다. BK-01/01a/01b의 결과와 전후36장·실제 URL·판독 근거는 [순차 구현 UI 기록](backlog.md#1-서버-관리-변경-이력)을 따른다. 다른19종을 이번 단계에서 재촬영했다고 합산하지 않는다.

서비스 운영자 관리(BK-02)는 백오피스1종과 공통 서버 감사 사용처를 양 폭/테마에서 확인했다. [26장과 실제 URL](backlog.md#2-서비스-운영자-지정회수)을 따른다.

탈퇴·공개 설정(BK-03~03e)은 아래10종을 검토·재검증했다. 설정·공개 DTO·새로 읽은 열린 상세까지 확인했고, 직접 UI 변경은3종과 공통 스위치다. [56장 전후·상태·한계](backlog.md#3-탈퇴프로필-공개-설정)를 따른다.

| 화면 | 실제 URL·확인 역할/상태 | 뷰포트·결과·근거 |
| --- | --- | --- |
| 내 정보 | `/me`, 실제 본인·활성 내전/저장 전후·503 실패·탈퇴 차단/취소/성공·세션 만료 | 1440×1000/390×844 primary/dark. BK-03/03a/03b/03e 완료. before4·after16·MCP4 |
| 홈·내전 목록·상세 | `http://127.0.0.1:40575/g/970000000000000001`, `/scrims`, `/scrims/1a545e40-b175-4e03-8f7e-6450b3e80f9d` | 비로그인·실제2세트 이력·비공개 사용자. primary 양 폭. [public captures](../../artifacts/ui-review/backlog/03-privacy/mcp-public/captures.json) |
| 수동 편성·대진 결과 | 같은 내전 `/manual`, `/result`. `/bracket`→`/result`, 수동 내전의 `/auction`→`/manual`은 정상 redirect | primary 양 폭. 실제 도착 화면만 집계. 과거 이름/Riot ID 비노출 |
| 실제 경매 | 별도 경매 fixture의 실제 setup/start/draw·비공개 후보/팀장·후보 목록·ROFL 전적 | 양 폭/테마. 원문 식별자 비노출·같은 실제 MMR·키보드. [4장 URL·동작](../../artifacts/ui-review/backlog/03-privacy/mcp-auction/captures.json) |
| 경기 상세 | `/g/970000000000000001/matches/83ee9c75-43b8-41ee-93ec-25e4fe29408c`와 detail fixture의 같은 세트 재조회·다른 세트 이동·빠른 재열기 | 공개 primary 양 폭·열린 상세 양 테마/폭8장. BK-03d 완료. 선택 객체의 과거 개인정보 복제 제거 |
| 사용자 전적·통계 | `/g/970000000000000001/players/e4470ccb-112d-4663-9ad4-7036a4ae84f5`, `/g/970000000000000001/stats` | 공개 primary 양 폭. 별도 공개 UUID의 기록/MMR, 기존 비공개 Snowflake 익명404. 같은 서버 관리자/본인 예외는 HTTP/DB |

공통 SwitchCell은 본인 설정·헤더 모드·관리자 모집 하드 피어리스에서 키보드로 확인했다. Discord 알려진 글의 갱신/유실·이동 차단은 DB 검증이며 실제 발송은 하지 않았다. CDN·폰트는 차단했고 사용자 DB migration·실제 로그인·Safari·음성 청취·물리 기기는 미검증이다. fixture마다 다른 포트/UUID를 같은 DB 행의 전후로 주장하지 않는다.


백오피스1종과공통 서버 관리1종의 동명이인 식별을 추가 검증했다. BK-02/02a/02b, 실제 서비스 운영자·1440×1000/390×844·양 테마·전후26장은 [2단계 UI 기록](backlog.md#2-서비스-운영자-지정회수)을 따른다.


경기 목록의 기간·시즌 필터(BK-04~04c)는 직접1종과 공통 SeasonSelector3종(홈·선수·통계)을 확인했다. [20장 실제 URL·역할·양 폭/테마·초안/오류/0결과/범위 밖/쪽 이동](backlog.md#4-경기-목록의-기간시즌-필터)과 기존 선택기의 즉시 이동 회귀를 기록했다. 초안 손실은 실패 재현→signature 보완→같은4조건 재통과했다. 전체20종을 새로 촬영한 것으로 합산하지 않는다.


웹 시즌 관리(BK-05~05b)는 `/g/970000000000000001/admin?tab=seasons`의 실제 관리자·현재/종료/무활성·409/503/취소/성공 상태를1440×1000/390×844 양 테마로 확인했다. [20장 URL·검사·기록 불변](backlog.md#5-웹-시즌-관리)을 기록하고 기존 멤버/Discord/이력도 browser4로 재검증했다. 탭 한 개가 추가된 기존 서버 관리1종으로 집계한다.

## 추가 기능의 최종 확인 범위

2026-11-15. 전체 취소·과거 시즌 선택·DB/ROFL 제한의 핵심 대상 **7종을 검토·브라우저 재검증**했고 **5종의 UI를 직접 수정**했다. 수동 편성·경기 상세는 기존 UI에서 새 복구·실패 상태를 검증했다. 기존 전체20종을 다시 촬영한 것으로 합산하지 않는다. 아래 URL은 실제 격리 fixture의 실행 당시 값이며 전체 query·역할·상태·뷰포트·PNG 해시·판독 담당자는 [88장 통합 목록](../../artifacts/ui-review/next/screenshots.json)에 기록했다.

| 페이지·실제 URL | 역할·상태·뷰포트 | 진단·수정·재검증 | 증거 |
| --- | --- | --- | --- |
| 서버 홈 `http://127.0.0.1:42483/g/970000000000000001?page=4` | 공개. 현재 빈 시즌·과거 기록·시즌 메뉴. 1440×1000/390×844·양 테마 | NX-03·03a 완료. 시즌 선택·순위 추가 조회·늦은 응답 차단, 운영 패널 현재 범위 유지 | [전](../../artifacts/ui-review/next/before/home-dark-390-season-menu.png) → [후](../../artifacts/ui-review/next/after/seasons/home-dark-390-season-menu.png) |
| 개인 전적 `http://127.0.0.1:42483/g/970000000000000001/players/970000000000000012?position=top&page=4` | 공개. 현재 빈 기록·과거 ROFL3세트. 1440/390·양 테마 | NX-03·03a 완료. 기존 필터·선수 링크 시즌 보존, page 초기화·키보드/ARIA | [전](../../artifacts/ui-review/next/before/player-dark-390-season-menu.png) → [후](../../artifacts/ui-review/next/after/seasons/player-dark-390-season-menu.png) |
| 통계 `http://127.0.0.1:42483/g/970000000000000001/stats?position=top&min=1&recent=1&page=4` | 공개. 빈/과거·긴 옵션. 1440/390·양 테마, 320dark/768primary/1024dark 추가 | NX-03·03a 완료. 다른 필터 보존·page 초기화·선수 링크와 범위·텍스트 경계 | [전](../../artifacts/ui-review/next/before/stats-dark-390-season-menu.png) → [후](../../artifacts/ui-review/next/after/seasons/stats-dark-390-season-menu.png), [추가 폭](../../artifacts/ui-review/next/after/seasons/intermediate.json) |
| 내전 요약 `http://127.0.0.1:41989/g/970000000000000001/scrims/8bcf4169-1688-4be4-bc20-3c258924e6e4` | 실제 관리자. 진행·취소 확인·취소·복구 확인·편성 준비. 1440/390·양 테마 | NX-01·01a 완료. 실제 결과/MMR 역분개, 이력·참가자 보존과 복구 의미, 확인창 읽기 폭·안전 포커스 | [전](../../artifacts/ui-review/next/before/wide-1440-primary-cancel-confirm.png) → [후](../../artifacts/ui-review/next/after/cancellation-mcp/1440-primary-cancel-confirm.png), [24상태](../../artifacts/ui-review/next/after/cancellation-mcp/captures.json) |
| 수동 편성 `http://127.0.0.1:41989/g/970000000000000001/scrims/8bcf4169-1688-4be4-bc20-3c258924e6e4/manual` | 실제 관리자. 전체 취소 후 복구된 기존10명·두 팀·포지션·MMR. 1440/390·양 테마 | NX-01 완료. 화면 코드 변경 없이 복구 후 정상 배정과 재편성·다음 경기 생성 검증 | [복구 후](../../artifacts/ui-review/next/after/cancellation-mcp/390-dark-restored-manual.png), [DB/행동](../../artifacts/ui-review/next/cancellation.md) |
| 대진 `http://127.0.0.1:43705/g/970000000000000001/scrims/7d36282e-5fed-457d-8603-aae490b4615e/bracket` | 공개·실제 관리자. 전체 취소 후 빈 대진. 1440primary/390dark | NX-01b 완료. 취소 원인 안내·편집 없음, 같은 내전 `/result`는307로 대진 이동. 이 경로를 별도 페이지로 세지 않음 | [전](../../artifacts/ui-review/next/before/cancelled-bracket-dark-390.png) → [후](../../artifacts/ui-review/next/after/cancelled-bracket-dark-390.png), [실제 URL](../../artifacts/ui-review/next/after/cancelled-bracket.json) |
| 경기 상세 `/g/970000000000000001/matches/cb61160d-9306-4344-8025-24cea807df0f` | 실제 출전자. ROFL429·503·파일/블루팀 보존·재시도 성공. 1440primary/390dark, reduced-motion | NX-02 완료. 화면 코드 변경 없이 실제 서버 실패와 동일 입력 재시도, 중복 결과 방지 | [실패](../../artifacts/ui-review/next/after/rofl/1440-rate-input-preserved.png) → [성공](../../artifacts/ui-review/next/after/rofl/1440-rate-retry-recorded.png), [6장](../../artifacts/ui-review/next/after/rofl/captures.json) |

before23장·after65장 모두 실제 이미지를 읽고 해시를 확인했다. before의 메뉴4장은 hydration/media 전환 중 촬영으로 비교에서 제외했고, 개발 mock 기본6장은 시즌 실데이터와 구분한다. fixture 재생성으로 일부 전후 UUID·포트는 다르며 같은 페이지 종류·상태·역할·폭을 비교했다. ROFL6장은 원본 메타데이터에 실제 pathname만 보존되어 origin을 추정하지 않았다. 외부 이미지·폰트가 차단된 fixture를 CDN·글꼴 품질 평가에 쓰지 않는다. 실제 fixture는 모두 종료·정리했다.

공통 확인창의 기존 계정·경매·결과 사용처는 정규 브라우저 회귀22건에 포함된다. 마지막 취소 대진 안내 뒤 관련 lifecycle4건과 웹 build·실제 MCP 두 폭을 다시 확인했다. [최종 감사](next-audit.md)에서 새 차단 문제는 확인하지 못했다. 실제 외부 계정·운영 환경·물리 기기/보조기기와 사용자 보류 법적 본문은 미검증 범위로 유지한다.

## 운영 후속의 추가 확인 범위

2026-11-15에는 요약·경매·결과의 3종 화면을 직접 수정·재검증했다. 기존 공통 대진의 빈 안내는 결과에서만 변형을 전달한다. 전체20페이지를 다시 촬영한 것으로 합산하지 않는다. 경로가 같은 내전의 단계·fixture UUID·테마는 새 페이지로 중복 계산하지 않는다.

| 실제 대상·역할 | 상태·범위 | 진행·증거 |
| --- | --- | --- |
| `/g/devGuild001/scrims/devScrim001`, `devScrim004`, `devScrim002/auction` | 개발 관리자 기본 화면, 1440×1000·390×844·양 테마. root UI 전후24장 | OP-01~04 공통 회귀. [전후 독립 읽기](../../artifacts/ui-review/operations/static-visual.md)·[촬영 목록/해시](../../artifacts/ui-review/operations/static-visual.json) |
| 격리 실제 관리자 `/g/{guild}/scrims/{id}`와 `/result` | 취소 확인/Escape·취소 후 복구·편성 전 중도 종료/원단계·실ROFL1:0 우세/재개. 1440×1000·390×844·양 테마16장 | OP-02·03 완료. [동적 실제 URL/해시](../../artifacts/ui-review/operations/after/lifecycle/captures.json)·[행동·보존 검증](../../artifacts/ui-review/operations/lifecycle.md) |
| 격리 실제 관리자/공개 관전자 `/g/{guild}/scrims/{id}/auction` | 키보드 추첨/직전 취소·영입과85P 보존/초기화, 준비→진행·503·15초 timeout·재시도·pause/manual/resume·hidden/offline/SPA 종료·POST0 | OP-01·04 완료. 1440 관리자·390 관전자, 다크 포함7장. [실제 URL/해시·실독](../../artifacts/ui-review/operations/auction.json)·[전체 과업](../../artifacts/ui-review/operations/auction.md) |

새 이미지47장(기본 전후24+실세션 lifecycle16+경매7)은 모두 직접 읽고 해시를 기록했다. 기본 before는 이번 UI 전 단계로, 동시에 진행한 백엔드 변경까지 제외한 `521e763`의 순수 golden이라고 주장하지 않는다. 실제 세션 fixture는 외부 이미지·폰트를 차단하므로 CDN·브랜드 글꼴 품질 판정과 분리한다. 실제 URL의 테스트 schema·세션은 실행 후 정리됐으며 재접근 가능한 운영 자료가 아니다. 시즌 명령·배포 검사는 사용자 페이지 수에 더하지 않는다. 전체 검증과 남은 운영 범위는 [현재 보고서](operations.md)를 따른다.

## 앞선 남은 과업의 추가 확인 범위

이번 직접 UI 수정·재검증은 요약·통계·수동 편성·경매4페이지다. 아래5개 내전 단계는 요약의 상태 변형이며 별도 페이지로 더하지 않는다. 격리 DB URL의 UUID와 실제 역할·상태는 [통합 시각 증거](../../artifacts/ui-review/remaining/feature-visual.json)에 실행 당시 값으로 기록했다. 이 fixture는 실행 후 정리되므로 같은 경로가 계속 접근 가능하다는 뜻은 아니다.

| 실제 URL·상태 | 역할·뷰포트 | 진단·수정·재검증 | 전후 증거 |
| --- | --- | --- | --- |
| `/g/devGuild001/scrims/devScrim001`, `devScrim007`, `devScrim008`, `devScrim004`, `devScrim005` | 공개·개발 관리자, 모집/편성/준비/진행/종료, 1440×1000·390×844, 양 테마 | DQ-14 완료. 단계 제목·번호 대비와 상태 구분 | [전](../../artifacts/ui-review/remaining/before/steps-recruit-primary-mobile.png) → [후](../../artifacts/ui-review/remaining/after/steps-recruit-primary-mobile.png), [전체48장](../../artifacts/ui-review/remaining/ui-proof.json) |
| `/g/devGuild001/stats` | 공개, 최근10 켜기/끄기, 1440×1000·390×844, 양 테마 | DQ-15 완료. label 24→44px, Space·여백 클릭 | [전](../../artifacts/ui-review/remaining/before/stats-primary-mobile.png) → [후](../../artifacts/ui-review/remaining/after/stats-primary-mobile.png) |
| `/g/devGuild001/scrims/devScrim007/manual` 및 격리 DB의 같은 경로 구조 | 개발/실제 세션 관리자, 기존6/10 보존·확정10/10 실제 시너지/5포지션 상대 전적 | FN-01 완료. 1440×1000·390×844, 양 테마 | [실제 기록 후](../../artifacts/ui-review/remaining/after/feature-manual-records-dark-mobile.png), [통합 회귀](../../artifacts/ui-review/remaining/feature-browser.json) |
| 격리 DB `/g/970000000000000001/scrims/{UUID}/auction` | 관리자·출전자, 같은 시즌 후보1게임·결과 취소 후0게임·포지션/시각 미확인 | FN-02 완료. 1게임 양 폭·양 테마, 0게임390×844 양 테마 | [기록](../../artifacts/ui-review/remaining/after/feature-auction-records-primary-mobile.png)·[빈 상태](../../artifacts/ui-review/remaining/after/feature-auction-zero-after-revert-dark-mobile.png), [실행 URL·이미지10장](../../artifacts/ui-review/remaining/feature-visual.json) |

추가 엔진은 Firefox·WebKit의 수동 편성/통계16조건, Orca는 안내·메뉴의 생성 발화25개, 정상 ROFL 경로는 격리 실제 세션의1440×1000·390×844에서 확인했다. 로컬 성능15회와 정상 결과 경기·선수 화면도 확인했다([조건·이미지19장](../../artifacts/ui-review/remaining/validation.md)). 이번48+10+19=77장의 직접 이미지 검토는 기존 전체20URL80조건과 분리한다. 브라우저 fixture의 차단된 외부 이미지·웹폰트는 브랜드/자산 판정에 사용하지 않는다. Safari·실제 음성 청취·물리 기기·라이브 OAuth·League 원본 파일은 미검증이다.

## 앞선 후속 6페이지의 확인 범위

최초 전체20페이지 검토 뒤 부분 충족으로 남은6페이지를 실제 수정했다. 시작·참가 흐름(홈·안내·모집 요약)과 편성·실력 판단(수동·선수·통계)의 세 페이지씩을 검증했다. 아래 링크는 이 후속 수정의 이미지이며 최초20페이지 표·재평가 이미지는 이력으로 보존한다. 양 테마는 primary/dark다.

| 화면·실제 URL | 역할·주요 상태 | 확인한 폭·테마 | 문제·진행 | 수정 전 → 수정 후 |
| --- | --- | --- | --- | --- |
| 홈 `/` | 실제 비로그인, 격리 실제 로그인 세션의 서버2개·빈 목록·조회503 | 1440/768/390/320 양테마, 실제세션1440/390 양테마 | DQ-03·10 완료 | [D 전](../../artifacts/ui-review/followup/public/before/home-desktop.png)·[M 전](../../artifacts/ui-review/followup/public/before/home-mobile.png) → [D 후](../../artifacts/ui-review/followup/public/after/home-desktop.png)·[M 후](../../artifacts/ui-review/followup/public/after/home-mobile.png) |
| 안내 `/docs` | 공개, 참가·기록/운영 목차, 6앵커·FAQ 펼침 | 1440/768/390/320 양테마 | DQ-06 완료 | [D 전](../../artifacts/ui-review/followup/public/before/docs-desktop.png)·[M 전](../../artifacts/ui-review/followup/public/before/docs-mobile.png) → [D 후](../../artifacts/ui-review/followup/public/after/docs-desktop.png)·[M 후](../../artifacts/ui-review/followup/public/after/docs-mobile.png) |
| 요약 `/g/devGuild001/scrims/devScrim001` | 개발 관리자·선발 관리, 003참가자·006정원마감·005종료, 요청실패/중복 | 1440/768/390/320·720×500 양테마, 관리640 추가 | DQ-07·08 완료 | [D 전](../../artifacts/ui-review/followup/workflow/before/scrim-primary-desktop.png)·[M 전](../../artifacts/ui-review/followup/workflow/before/scrim-primary-mobile.png) → [D 후](../../artifacts/ui-review/followup/workflow/after/scrim-primary-desktop.png)·[M 후](../../artifacts/ui-review/followup/workflow/after/scrim-primary-mobile.png) |
| 수동 `/g/devGuild001/scrims/devScrim007/manual` | 개발 관리자, 6/10·선택/교환/해제/취소·실패복구·읽기전용·긴이름 | 1440/768/390/320·720×500 양테마, 360/640 추가 | DQ-01·04·11 완료 | [D 전](../../artifacts/ui-review/followup/workflow/before/manual-primary-desktop.png)·[M 전](../../artifacts/ui-review/followup/workflow/before/manual-primary-mobile.png) → [D 후](../../artifacts/ui-review/followup/workflow/after/manual-primary-desktop.png)·[M 후](../../artifacts/ui-review/followup/workflow/after/manual-primary-mobile.png) |
| 선수 `/g/devGuild001/players/devUser001` | 공개 개발표본, 전체/탑 필터·15지표·MMR·레이더 | 1440/768/390/320 양테마 | DQ-05·12 완료 | [D 전](../../artifacts/ui-review/followup/before/player-primary-desktop.png)·[M 전](../../artifacts/ui-review/followup/before/player-primary-mobile.png) → [D 후](../../artifacts/ui-review/followup/after/player-primary-desktop.png)·[M 후](../../artifacts/ui-review/followup/after/player-primary-mobile.png) |
| 통계 `/g/devGuild001/stats` | 공개 개발표본, 긴한/영이름·7지표정렬·키보드/터치·좁은챔피언표 | 1440/768/390/320 양테마, Tab640 추가 | DQ-02·09·13 완료 | [D 전](../../artifacts/ui-review/followup/data/before/stats-primary-1440.png)·[M 전](../../artifacts/ui-review/followup/data/before/stats-primary-390.png) → [D 후](../../artifacts/ui-review/followup/data/after/stats-primary-1440.png)·[M 후](../../artifacts/ui-review/followup/data/after/stats-primary-390.png) |

원본 상태·샘플은 검증 후6/10의 정확한 선수/자리로 복원한다. 세션 fixture의 외부 origin 차단으로 실제세션 PNG는 웹폰트 fallback이므로 폰트 검증과 분리한다. 실제 서버 OAuth·실운영 쓰기·실기기·Safari·스크린리더는 확인하지 않았다. 정책2페이지는 승인 본문이 없어 콘텐츠 보류다. 상세 측정·직접 읽은 이미지·해시는 [후속 기록](followup.md)의 증거 색인을 따른다.

## 진행 기준

기본 화면은 1440×1000·390×844에서 Playwright MCP로 수정 전 촬영했다. 실제 이미지를 읽는 검토와 추가 역할·상태 검증은 아래에 별도로 기록한다. 전체20개 수정·재검증 완료. 개별 개선18개와 공통 프레임만 적용한 정책2개를 구분하며 공통 변경도 영향 화면 수에 포함한다.

| 화면 | 실제 URL | 역할·기본 상태 | 수정 전 이미지 (desktop/mobile) | 진단 | 수정·재검증 | 문제 |
| --- | --- | --- | --- | --- | --- | --- |
| home | / | 비로그인 | [D](../../artifacts/ui-review/before/home-desktop.png) · [M](../../artifacts/ui-review/before/home-mobile.png) | 시각·키보드·상태 확인 | 완료 [D](../../artifacts/ui-review/after/home-desktop.png) · [M](../../artifacts/ui-review/after/home-mobile.png) | UI-11 |
| docs | /docs | 비로그인 | [D](../../artifacts/ui-review/before/docs-desktop.png) · [M](../../artifacts/ui-review/before/docs-mobile.png) | 시각·키보드·상태 확인 | 완료 [D](../../artifacts/ui-review/after/docs-desktop.png) · [M](../../artifacts/ui-review/after/docs-mobile.png) | UI-10, UI-11 |
| terms | /terms | 비로그인 | [D](../../artifacts/ui-review/before/terms-desktop.png) · [M](../../artifacts/ui-review/before/terms-mobile.png) | 시각·키보드·상태 확인 | 완료 [D](../../artifacts/ui-review/after/terms-desktop.png) · [M](../../artifacts/ui-review/after/terms-mobile.png) | UI-11 (공통만), 정책 본문 후속 |
| privacy | /privacy | 비로그인 | [D](../../artifacts/ui-review/before/privacy-desktop.png) · [M](../../artifacts/ui-review/before/privacy-mobile.png) | 시각·키보드·상태 확인 | 완료 [D](../../artifacts/ui-review/after/privacy-desktop.png) · [M](../../artifacts/ui-review/after/privacy-mobile.png) | UI-11 (공통만), 정책 본문 후속 |
| me | /me?mock=1 | 명시적 개발 목 미리보기 | [D](../../artifacts/ui-review/before/me-desktop.png) · [M](../../artifacts/ui-review/before/me-mobile.png) | 시각·역할·빈 상태·긴 이름 확인 | 완료 [D](../../artifacts/ui-review/after/me-desktop.png) · [M](../../artifacts/ui-review/after/me-mobile.png) | UI-11, UI-16 |
| backoffice | /backoffice?mock=1 | 명시적 개발 목 미리보기 | [D](../../artifacts/ui-review/before/backoffice-desktop.png) · [M](../../artifacts/ui-review/before/backoffice-mobile.png) | 시각·대기·오프라인·재시도 확인 | 완료 [D](../../artifacts/ui-review/after/backoffice-desktop.png) · [M](../../artifacts/ui-review/after/backoffice-mobile.png) | UI-08, UI-11, UI-15, UI-16 |
| guild | /g/devGuild001 | 개발 샘플 관리자·공개 조회 | [D](../../artifacts/ui-review/before/guild-desktop.png) · [M](../../artifacts/ui-review/before/guild-mobile.png) | 시각·역할·상태·동작 확인 | 완료 [D](../../artifacts/ui-review/after/guild-desktop.png) · [M](../../artifacts/ui-review/after/guild-mobile.png) | UI-04, UI-05, UI-09, UI-11, UI-15 |
| scrims | /g/devGuild001/scrims | 개발 샘플 관리자·공개 조회 | [D](../../artifacts/ui-review/before/scrims-desktop.png) · [M](../../artifacts/ui-review/before/scrims-mobile.png) | 시각·역할·상태·동작 확인 | 완료 [D](../../artifacts/ui-review/after/scrims-desktop.png) · [M](../../artifacts/ui-review/after/scrims-mobile.png) | UI-06, UI-10, UI-11, UI-12, UI-18, UI-20 |
| scrim | /g/devGuild001/scrims/devScrim001 | 개발 샘플 관리자·공개 조회 | [D](../../artifacts/ui-review/before/scrim-desktop.png) · [M](../../artifacts/ui-review/before/scrim-mobile.png) | 시각·역할·상태·동작 확인 | 완료 [D](../../artifacts/ui-review/after/scrim-desktop.png) · [M](../../artifacts/ui-review/after/scrim-mobile.png) | UI-06, UI-08, UI-10, UI-11, UI-12, UI-20 |
| manual | /g/devGuild001/scrims/devScrim007/manual | 개발 샘플 관리자·공개 조회 | [D](../../artifacts/ui-review/before/manual-desktop.png) · [M](../../artifacts/ui-review/before/manual-mobile.png) | 시각·역할·상태·동작 확인 | 완료 [D](../../artifacts/ui-review/after/manual-desktop.png) · [M](../../artifacts/ui-review/after/manual-mobile.png) | UI-01, UI-08, UI-10, UI-11, UI-21 |
| auction | /g/devGuild001/scrims/devScrim002/auction | 개발 샘플 관리자·공개 조회 | [D](../../artifacts/ui-review/before/auction-desktop.png) · [M](../../artifacts/ui-review/before/auction-mobile.png) | 시각·역할·상태·동작 확인 | 완료 [D](../../artifacts/ui-review/after/auction-desktop.png) · [M](../../artifacts/ui-review/after/auction-mobile.png) | UI-02, UI-08, UI-09, UI-10, UI-11, UI-13 |
| bracket | /g/devGuild001/scrims/devScrim008/bracket | 개발 샘플 관리자·공개 조회 | [D](../../artifacts/ui-review/before/bracket-desktop.png) · [M](../../artifacts/ui-review/before/bracket-mobile.png) | 시각·역할·상태·동작 확인 | 완료 [D](../../artifacts/ui-review/after/bracket-desktop.png) · [M](../../artifacts/ui-review/after/bracket-mobile.png) | UI-08, UI-11 |
| result | /g/devGuild001/scrims/devScrim005/result | 개발 샘플 관리자·공개 조회 | [D](../../artifacts/ui-review/before/result-desktop.png) · [M](../../artifacts/ui-review/before/result-mobile.png) | 시각·역할·상태·동작 확인 | 완료 [D](../../artifacts/ui-review/after/result-desktop.png) · [M](../../artifacts/ui-review/after/result-mobile.png) | UI-11 |
| matches | /g/devGuild001/matches | 개발 샘플 관리자·공개 조회 | [D](../../artifacts/ui-review/before/matches-desktop.png) · [M](../../artifacts/ui-review/before/matches-mobile.png) | 시각·역할·상태·동작 확인 | 완료 [D](../../artifacts/ui-review/after/matches-desktop.png) · [M](../../artifacts/ui-review/after/matches-mobile.png) | UI-10, UI-11, UI-18 |
| match | /g/devGuild001/matches/devMatch001 | 개발 샘플 관리자·공개 조회 | [D](../../artifacts/ui-review/before/match-desktop.png) · [M](../../artifacts/ui-review/before/match-mobile.png) | 시각·역할·상태·동작 확인 | 완료 [D](../../artifacts/ui-review/after/match-desktop.png) · [M](../../artifacts/ui-review/after/match-mobile.png) | UI-08, UI-09, UI-10, UI-11, UI-15 |
| player | /g/devGuild001/players/devUser001 | 개발 샘플 관리자·공개 조회 | [D](../../artifacts/ui-review/before/player-desktop.png) · [M](../../artifacts/ui-review/before/player-mobile.png) | 시각·역할·상태·동작 확인 | 완료 [D](../../artifacts/ui-review/after/player-desktop.png) · [M](../../artifacts/ui-review/after/player-mobile.png) | UI-04, UI-06, UI-11, UI-14, UI-18, UI-19 |
| stats | /g/devGuild001/stats | 개발 샘플 관리자·공개 조회 | [D](../../artifacts/ui-review/before/stats-desktop.png) · [M](../../artifacts/ui-review/before/stats-mobile.png) | 시각·역할·상태·동작 확인 | 완료 [D](../../artifacts/ui-review/after/stats-desktop.png) · [M](../../artifacts/ui-review/after/stats-mobile.png) | UI-03, UI-04, UI-06, UI-09, UI-10, UI-11, UI-15, UI-18 |
| admin | /g/devGuild001/admin | 개발 샘플 관리자·권한 제한 | [D](../../artifacts/ui-review/before/admin-desktop.png) · [M](../../artifacts/ui-review/before/admin-mobile.png) | 시각·역할·상태·동작 확인 | 완료 [D](../../artifacts/ui-review/after/admin-desktop.png) · [M](../../artifacts/ui-review/after/admin-mobile.png) | UI-06, UI-08, UI-10, UI-11, UI-15, UI-17, UI-18 |
| components | /dev/components | 비로그인 | [D](../../artifacts/ui-review/before/components-desktop.png) · [M](../../artifacts/ui-review/before/components-mobile.png) | 시각·폼·파일·오류·키보드 확인 | 완료 [D](../../artifacts/ui-review/after/components-desktop.png) · [M](../../artifacts/ui-review/after/components-mobile.png) | UI-11, UI-16 |
| error | /dev/error?status=403 | 비로그인 | [D](../../artifacts/ui-review/before/error-desktop.png) · [M](../../artifacts/ui-review/before/error-mobile.png) | 401·403·404·500 상태·재시도 확인 | 완료 [D](../../artifacts/ui-review/after/error-desktop.png) · [M](../../artifacts/ui-review/after/error-mobile.png) | UI-07, UI-11 |

## 추가 검증 목록

- 중간 폭 768·1024px: 헤더, 편성, 경매, 대진, 데이터 표.
- 라이트(primary)·다크(dark), reduced-motion, 200% 확대에 해당하는 좁은 유효 폭, 긴 한글·영문.
- 참가자: devScrim003 신청, devScrim006 정원 마감. 관전자: devScrim005 결과·경매 완료.
- 빈 상태: devGuild002의 홈·내전·경기·통계, /me?mock=1&preview=empty.
- 오류: /me 비로그인 401, /g/devGuild002/admin 403, 404, /dev/error?status=500, 서버 홈 preview=error.
- 폼: 모집 생성·수정, 참가 신청, Riot 계정 조회 실패·재시도, ROFL 잘못된 파일, 저장 중복 클릭·입력 보존.
- devMatch005: 세트 기록 없음·실제 시각 null. 경기 상세의 앞선 세트 game 쿼리.
- 키보드: 본문 바로가기·메뉴·필터·모달 포커스 순환/복귀·배치·표 스크롤.

## 계정·운영 상태·개발 화면 재검증

계정4개는 기본 두 폭·두 테마16장과 빈 계정·긴 이름·상태 오프라인/복구·파일 선택·재시도·401/404/500의 추가13장을 촬영하고 실제 이미지를 읽었다. 업무 서버 변경은 없으며 모의 계정 역할과 합성 파일 선택을 사용했다. [계정 검증](../../artifacts/ui-review/account-validation.json).

320×844에서 전체20개 기본 경로와 각 첫12개 Tab 경로를 추가 확인했다. 페이지 전체 가로 넘침·포커스 스모크 결함·JS 예외는 없었으며 로컬 표·선택 목록 스크롤은 정상 동작으로 구분했다. 당시 발견한 PageNav의40px 조작 영역과 개인 전적의 반복 게임 목적지는 이후 공통/상세 묶음에서 수정·재검증을 완료했다. [좁은 폭 감사](../../artifacts/ui-review/narrow-audit.json).

## 실행 환경과 한계

기본 MCP는 /opt/google/chrome/chrome 누락으로 시작하지 못했고 자동 설치는 sudo 인증 때문에 실패했다. 설치된 Chromium을 executable-path로 지정한 동일한 @playwright/mcp 0.0.85를 별도 stdio 연결해 촬영을 수행했다. 개발 서버가 꺼져 있어 pnpm dev --host 127.0.0.1로 시작했다. 이전 세션 91174는 종료되었고 현재 PTY 세션 4876을 사용한다. 모든 조작은 개발 샘플에서 수행하며 실제 OAuth·실서버 쓰기는 하지 않는다. 실제 모바일 기기·Safari·보조기기 낭독은 별도 검증 범위다.


## 최종 전체 게이트

- 전체20개 기본 URL을1440×1000·390×844·라이트/다크에서 총80조건으로 다시 촬영했다. 80조건 모두 h1 하나·가로 넘침 없음·입력 이름 누락 없음·중복 ID 없음·잘못된 브랜드 문구 없음. 페이지 JS 예외0이며 의도한403화면의 HTTP 리소스 오류4건만 구분한다.
- 기본 수정 전40장과 최종80장의 합집합을 모두 실제 이미지로 읽었다. [수정 전 읽기](../../artifacts/ui-review/final-image-read-before.json), [공개·계정32장](../../artifacts/ui-review/final-image-read-public-account.json), [데이터·운영36장](../../artifacts/ui-review/final-data-workflow-visual-read.json), [상세·관리·개발20장](../../artifacts/ui-review/final-image-read-root.json). 일부 중복을 제외한 최종 합집합은80장이다.
- 측정 기록은 [final-0](../../artifacts/ui-review/final-0.json)·[final-1](../../artifacts/ui-review/final-1.json)·[final-2](../../artifacts/ui-review/final-2.json)·[final-3](../../artifacts/ui-review/final-3.json)·[final-4](../../artifacts/ui-review/final-4.json). 다크 캡처는 기본 파일 이름에 `-dark`를 추가한 같은 폴더에 있다.
- 수동 편성의 테스트 잔여 배치7/10을 원래6/10·정확한 선수/자리로 복원하고 네 장을 재촬영·다시 읽었다. 갤러리 다크의 일시적인 누락 캡처도 새 페이지의 실제 글자·색·위치를 확인한 뒤 두 장을 다시 촬영·읽었다. 원인을 확인하지 않은 캡처 한 장을 제품 결함으로 단정하지 않는다. [복원·재촬영](../../artifacts/ui-review/final-fixture-validation.json).
- 추가320px 전체20개는 [좁은 폭 감사](../../artifacts/ui-review/narrow-audit.json). 여기서 찾은40px 쪽 이동은 [44px·100쪽·열린 목록 resize 재검증](../../artifacts/ui-review/pagination-validation.json)으로 완료했다.
- 역할·실패 조건은 각 묶음의 JSON으로 재현했다. 실제 세션/권한·계정 연결 계약은 격리 DB 브라우저 회귀7개가 추가 확인했다. 물리 기기·Safari·보조기기 낭독·실운영 쓰기는 이80조건에 포함하지 않는다.

## 추가 상태·역할의 실제 대상

기본20개 외의 아래 조건은 페이지 수를 중복 계산하지 않는다. 폭·테마는 해당 묶음에서 확인한 범위이며 모든 추가 상태의 직교 조합을 뜻하지 않는다. 조건별 실제 실행 표본·상호작용·요청·스크린샷은 JSON에 기록한다.

| 대상 URL·조건 | 확인한 상태·역할 | 뷰포트·테마와 근거 |
| --- | --- | --- |
| `/me?mock=1&preview=empty`, `/me` | 계정 없음·긴 식별자, 실제 비로그인401 | 1440/390·양 테마, [계정](../../artifacts/ui-review/account-validation.json) |
| `/backoffice?mock=1`, `/dev/error?status=404`, `status=500` | 대기·중복 재확인·실패·오프라인/복구, 오류 재시도·noindex | 1440/390·양 테마, [계정](../../artifacts/ui-review/account-validation.json) |
| `/g/devGuild002`, 하위 `/scrims`, `/matches`, `/stats` | 공개 빈 서버·빈 목록·기록 없음 | 1440/390·양 테마, [데이터](../../artifacts/ui-review/data-validation.json) |
| `/g/devGuild001?preview=error`, 순위 응답503 | 부분 조회 실패·Enter 재시도·추가 조회 복구 | 1440/390, [데이터](../../artifacts/ui-review/data-validation.json) |
| 내전 `devScrim003`, `devScrim006`, `devScrim004`, `devScrim005`, `devScrimPast10` | 참가자·정원 마감·긴 제목/진행·읽기 전용 완료·중도 종료 | 1440/390, [역할·상태](../../artifacts/ui-review/workflow-readonly-validation.json) |
| 내전 `devScrim001` 설정·신청, `/scrims` 생성 | 잘못된 입력·실패/합성 성공·입력 보존·조합·중복·열린 창 크기 전환 | 1440/390, [폼](../../artifacts/ui-review/forms-validation.json) |
| 내전 `devScrim007/manual`, `devScrim002/auction`, `devScrim008/bracket` | 배치·교환·해제·실패 롤백, 준비/실시간/완료·0점·상한, 대진 선택·배치·잠금 | 390/768/1024/1440·양 테마·reduced-motion, [팀](../../artifacts/ui-review/workflow-team-validation.json)·[대진](../../artifacts/ui-review/bracket-validation.json) |
| 경기 `devMatch001?game=devMatch001-g1`, `devMatch002`, `devMatch004`, `devMatch005` | 세트 선택·지연·완료·중도 종료·기록 없음/시각null, 선수 상세·잘못된 ROFL·전송 실패 | 320/390/768/1024/1440·양 테마, [상세](../../artifacts/ui-review/detail-validation.json)·[실패](../../artifacts/ui-review/upload-validation.json) |
| 선수 `devUser001?position=top`, `?page=999` | 필터·기록 보존·빈 쪽/1쪽 복구·장문·15지표·중복 링크 해소 | 320/390/768/1024/1440·양 테마, [추가 상세](../../artifacts/ui-review/detail-extra-validation.json) |
| `/g/devGuild001/admin`, `?tab=discord`, `/g/devGuild002/admin` | 관리자·멤버/Discord·권한403, 계정 조회/연결 오류·복구·중복 잠금·포커스 | 1440/390·양 테마, [관리 재검증](../../artifacts/ui-review/admin-validation.json) |
| 쪽 이동의 실제6사용처·브라우저 임시100쪽 마운트 | 44px·생략 목록·Tab/Enter/Escape·동시에 한 목록·열린 채resize | 320/390/768/1440·다크 포함, [쪽 이동](../../artifacts/ui-review/pagination-validation.json) |

## 최종 추가 발견의 재검증

- UI-20: 모집 생성·수정 달력의 요일/날짜 열·이름·빈 칸·선택 상태·선택 뒤 시각 입력·Escape/폐기 확인/포커스 복귀를 12조건에서 확인했다. 생성은 1440×1000·390×844·720×500·320×844 양 테마, 수정은 1440×1000·390×844 양 테마다. 날짜 열 84개 모두 실제 날짜와 일치하고, 추가12장도 실제 이미지를 읽었다. [검증·이미지·해시](../../artifacts/ui-review/calendar-validation.json). 기존 확대 감사의 빈 칸 포커스 기록은 수정 전 발견 근거로 보존한다.
- UI-21: 수동 편성 후보·빈 자리·배정 선수의 기본/hover/선택·교환 배경 대비를 양 테마·두 기본 폭의16상태 조건에서 재측정해 라이트 최소6.15:1·다크 최소4.95:1을 통과했다. 최종 canonical 네 장도 정상 초기 화면으로 다시 촬영·실제 읽고 기존 해시를 갱신했다. [대비 원값](../../artifacts/ui-review/manual-contrast-validation.json).

최종 기술 감사와 모든 명령 결과는 [Assessment B](../../artifacts/ui-review/final-assessment-b.md)·[checks.json](../../artifacts/ui-review/checks.json)에 기록했다. 진단 전용 live-server는 종료했으며 개발 서버5173은 결과 확인용으로 유지한다.

[최종80장 읽기 합집합·현재 해시·원본 확인서 연결](../../artifacts/ui-review/final-read-coverage.json). 기존56개 해시는 모두 현재 파일과 일치하며, 처음에 경로만 기록한24개는 확인서와 현재 해시를 함께 연결했다.
