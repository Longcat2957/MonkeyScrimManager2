# 미구현 기능 순차 구현의 UI 검증

2026-11-15. 기준 커밋 `d803c65`. 전체 실행 순서와 사용자 결정은 [작업표](../remaining-implementation.md)를 따른다. 기존20종 전수 개선을 다시 집계하지 않고 각 단계에서 바뀐 화면과 공통 사용처를 재검증한다.

## 1. 서버 관리 변경 이력

대상은 서버 관리1종이다. 계정 연결·대표 변경·해제와 Discord 설정의 성공한 실제 변경을 같은 트랜잭션으로 기록하고, 관리자 전용 `?tab=audit`에서20개씩 읽는다. 새 공개 API나 이력 되돌리기 기능은 만들지 않았다.

| ID | 근거·우선순위 | 적용·완료 조건 | 결과 |
| --- | --- | --- | --- |
| BK-01 | 계정/설정 변경의 별도 감사 이력 없음. 후속 요구 | 최소 원장·현재 권한·서버 범위·무변경 미기록·쓰기 실패 전체 롤백 | 구현·DB/HTTP 완료 |
| BK-01a | 초기 실화면 전체 검토에서 헤더 관리 링크와 본문 멤버 전환이 같은 이동을 제공. P2, 기존 표현을 재사용한 문제이며 새 회귀로 단정하지 않음 | 현재 관리 화면의 헤더 항목만 정적 현재 위치로 표시. 본문 전환은 한 곳. 다른 헤더 링크·상위 목록 이동 유지 | 수정 후 데스크톱/열린 모바일 메뉴의 링크0·키보드 전환·검색 초기화 재검증 |
| BK-01b | 범위 밖 쪽과 총 이력0은 다른 상태. 새 상태 요구 | 별도 빈 문구·기존 PageNav로 복귀, 긴 담당자/계정 이름 줄바꿈 | 양 테마·양 폭·쪽99→1 복귀 완료 |

**적용한 Impeccable 기능:** clarify는 변경 전후·담당자와 빈 상태 문구, layout·typeset은 조작 없는 최신순 목록과 날짜·본문 위계, adapt·harden은 긴 이름·쪽 이동·권한/실패 경계, polish는 기존 Slate/STDF·공통 컴포넌트·포커스를 유지하는 데 적용했다. document로 DESIGN·sidecar·페이지/라우팅·ERD에 실제 구성을 병합했다.

**코드:** `server/guild/audit.ts`, `features/guild/audit.ts`, `server/accounts/service.ts`, `server/guild/settings.ts`, `0009_guild_audit.sql`, `GuildAuditHistory.svelte`, 서버 관리 loader/화면, `ContextNav.svelte`/`navigation.ts`, 개발 샘플의 실제 조작 이력이다. 원장은 사용자/계정 참조만 저장하며 이름·Riot ID·PUUID·토큰·원시 요청을 복제하지 않는다. 역할/채널 설정의 이전/이후 ID·이름은 운영 문맥으로 보존한다.

| 검사 | 결과 |
| --- | --- |
| 신규 감사 DB7 + 기존 계정10/Discord 설정8 | 25/25 통과. 새 migration은 격리 schema에만 적용 |
| 신규 HTTP | 2/2 통과. 비로그인401·일반 멤버403·부분 데이터 비공개·다른 서버 격리·반복 무기록 |
| 실제 관리자 브라우저 | 4/4 통과. 1440×1000/390×844·primary/dark, 키보드·5개 실제 변경·25개 쪽 이동·긴 이름·쪽99 복구·헤더/본문 중복 제거 |
| pnpm test | 웹444·봇80 통과 |
| pnpm check / check:tests / build | 통과. Svelte 오류0·경고0. 마지막 헤더 수정 후 웹/봇 build·check·브라우저 재검증 |
| 소스 detector | [27개 기존 advisory](../../artifacts/ui-review/backlog/01-audit/source-detect.json), 새 primary0. 새 무시 규칙 없음 |

**화면 증거:** [기존 기본 관리자4장](../../artifacts/ui-review/backlog/01-audit/before/captures.json), [헤더 중복 정리 전 실제 이력4장](../../artifacts/ui-review/backlog/01-audit/before-navigation-fix/captures.json), [최종 상태24장](../../artifacts/ui-review/backlog/01-audit/after/captures.json), [최종 Playwright MCP4장](../../artifacts/ui-review/backlog/01-audit/after-mcp/captures.json)을 보존한다. 실제 URL·역할·폭·상태·해시·판독 담당자는 각 목록에 기록한다. 기본 before는 개발 샘플 맥락이며 실제 DB의 같은 행 golden으로 주장하지 않는다. 별도 fixture의 UUID·포트·시각 차이는 변경 효과에 포함하지 않는다.

테스트 준비 과정에서 기존 SvelteKit action 내부 상태204와 전송 HTTP200, Discord 동기화 후 현재 이름, hydration과 fixed 팝업 호스트의 높이0을 자동화 가정과 구분했다. 제품 결함으로 집계하지 않는다. fullPage 촬영은 맨 위로 이동해 sticky 헤더/포커스 링크의 촬영 경계를 제거한 최종본으로 교체했다.

fixture의 외부 이미지·폰트는 차단했다. 브랜드 글꼴/CDN·물리 기기·실제 스크린리더·정량 CWV 검증으로 해석하지 않는다. 실제 계정·사용자 DB·Discord 발송·운영 배포는 변경하지 않았고 테스트 앱·세션·schema는 정리했다. 사용자 개발 서버5173은 유지한다.

## 2. 서비스 운영자 지정·회수

백오피스1종에 기존 상태 영역과 함께 운영자 목록·지정 폼·회수·변경 이력을 추가했다. `0010` 원장과 기존 `users.isServiceAdmin`을 사용하고 최초0명 지정만 서버 CLI로 제공한다. 웹 변경은 현재 DB 권한·공통 잠금·마지막 운영자 보호·같은 트랜잭션의 감사 저장을 사용한다. 일반 서버 관리자 권한과 분리했다.

| ID | 근거·우선순위 | 변경·완료 조건 | 결과 |
| --- | --- | --- | --- |
| BK-02 | 서비스 운영자 지정·회수 경로 미구현 | 최초 지정 CLI·기존 운영자의 웹 관리·권한 회수 즉시 반영·동시 마지막 운영자 보호 | 구현·검증 완료 |
| BK-02a | 동명이인의 권한 버튼·확인·감사만 이름으로 구별할 수 없음. P2 | 접근 가능한 버튼/폼 이름·확인 대상·감사 담당/대상에 ID 제공. 긴 이름은 줄바꿈 | 실제 동일32자리 W 이름·양 폭/테마 검증. 서버 관리 감사의 같은 원인도 보완하고 기존 browser4 재검증 |
| BK-02b | 새 폼의 실패·취소·중복·회수 후 포커스 상태 | 잘못된 입력/404는 입력 보존·설명 연결, 확인 취소0POST, 처리 중 단일 요청. 타인 회수는 ID 입력, 자기 회수는303 내 정보 | 브라우저4·HTTP2 완료 |

Impeccable clarify·harden·adapt·polish로 권한 범위·동명이인·긴 영문·실패 입력·포커스 복구를 보완했다. 기존 STDF Input/Button·confirm·PageNav를 사용하고 새 모달·토큰·장식은 추가하지 않았다. document로 운영 문서·페이지·ERD·DESIGN을 실제 구성에 맞췄다.

- **검사:** 신규 DB10·기존 session6·CLI lite1의17/17, HTTP2/2, 신규 browser4/4, 공통 감사 browser4/4, 웹445·봇80, check·테스트 타입·웹/봇 build 통과. Svelte 오류0·경고0. `.mts` CLI도 앱 타입 검사 대상에 포함했다. 초기 Kit3의 readonly URL/GotoOptions 타입 오류는 설치 공식 타입과 대조해 수정 후 재검증했다.
- **동작:** 존재하지 않는 사용자404·입력/오류 연결·확인 취소/진행·요청 중 중복 차단·마지막1명 비활성/서버409·현재 역할 회수 뒤403·자기 회수303·일반 길드 관리자 우회 금지. 서비스 운영 권한을 얻어도 길드 관리 권한을 얻지 않는다.
- **실화면:** [before4](../../artifacts/ui-review/backlog/02-service-admin/before/captures.json), [after16](../../artifacts/ui-review/backlog/02-service-admin/after/captures.json), [MCP 백오피스4·공통 서버 감사2](../../artifacts/ui-review/backlog/02-service-admin/after-mcp/captures.json)의26장을 실제 읽고 해시·실행 URL·역할·뷰포트·담당자를 기록했다. 일부 upstream 동기화가 이름을 갱신해도 ID로 담당/대상을 구별한다. 이력은 이름 스냅샷을 복제하지 않는다.
- **추정과 구분:** 공통 확인창의 긴 영문 잘림 가능성은32자리 W의 실제 텍스트 줄 경계를 양 폭/양 테마에서 측정해 넘침 없음을 확인했다. 추가 CSS를 만들지 않았다. 고정 팝업의 바깥 호스트 높이0과 초기 SSR/Discord 동기화는 실제 조작 자식·현재 이름 검증으로 구분했다.
- **제한:** 실제 초기 운영자 지정·사용자 DB migration·운영 배포·실 Discord는 실행하지 않았다. 격리 CLI·앱·세션·schema는 종료·정리했다. 제1단계의36장 이미지는 당시8859be4 구현 이력으로 유지하며 제2단계의 ID 보완은 새 MCP2장과 browser4를 근거로 한다.
