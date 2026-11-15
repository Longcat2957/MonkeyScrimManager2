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
