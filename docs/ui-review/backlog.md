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

## 3. 탈퇴·프로필 공개 설정

| ID | 근거·우선순위 | 변경·완료 조건 | 상태 |
| --- | --- | --- | --- |
| BK-03 | 사용자 확정: 과거 전적·MMR 보존, 개인정보·연결 계정 정리 | 본인 전용 설정/탈퇴·현재 상태 검사·모든 본인 세션 정리·역사 원장 동일성·공개 DTO 스냅샷 누출 방지 | 완료 |
| BK-03a | 설치 STDF3 Switch 실제 버튼에 type·role·aria-checked·native disabled가 없음. 직접 소스 확인, 기존 결함으로 신규 회귀와 구분. P1 | 같은 SwitchCell의 헤더 모드·모집 하드 피어리스·새 공개 설정 전부 단일 버튼 의미/상태·Space·부제 설명 분리 확인 | 본인·헤더·모집 설정의 키보드/상태 재검증 완료 |
| BK-03b | 새 저장·탈퇴 과업의 실패/중복/권한 변화 상태. P1 | 실패 선택값 보존·확인 취소0POST·처리 중 단일 요청·현재 내전/운영 권한409·결과 불명 재확인·성공303 | DB·HTTP·브라우저 완료 |
| BK-03c | 개인정보 변경 후 알려진 Discord 게시글의 오래된 이름·멘션. P1 | 기존 현재 채널의 확인된 메시지만 재예약. 삭제/교체/전달불명 상태에서 과거 새글 자동생성 금지 | helper8·기존 게시8·핵심23 검증 완료 |
| BK-03d | 경기 상세 팝업이 선수 객체를 state에 복제해 페이지 자료 갱신 후 이전 이름을 유지할 수 있음. 직접 코드 확인. P1 | gameId·player.key만 선택값으로 저장하고 현재 자료에서 파생. 같은 세트 갱신은 새 이름/수치, 다른 세트·선수 누락은 닫기 | 동일 세트 재조회4·빠른 재열기2 통과 |
| BK-03e | 새 설정 컴포넌트의 원본 객체를 깊은 state proxy로 비교해 hydration 때 effect_update_depth_exceeded 발생. 이번 구현 중 발견한 회귀. P1 | 참조 비교용 원본은 `$state.raw`로 유지. SSR 정상과 hydration 후 정상·설정 저장·실패 선택값 보존을 구분해 같은4조건 재검증 | 수정·웹 재빌드·본인 브라우저4 재검증 완료 |

Impeccable harden·clarify는 공개 항목의 독립성·탈퇴 차단 이유·실패 복구, adapt·typeset은 한 열 설정과 긴 이름, polish는 기존 STDF·공통 확인창·동일한 저장 패턴에 적용한다. 새로운 화면 장식이나 브랜드 변경은 하지 않는다.

**코드:** `accounts/privacy.ts`·`public-identity.ts`·`lifecycle.ts`, 세션/OAuth·자동 소속 동기화·현재 권한·복구/재개/결과 정정 guard, 공개 모집/편성/경매/대진/경기/기록/순위 DTO, 알려진 게시글 재예약, `/me` load/actions·`PrivacySettings`·개발 목, `SwitchCell`·`RankingBoard`·경기 상세 선택 상태,0011/0012다. 동일한 이름·Riot ID를 DB 이력에서 지워 결과 원장을 바꾸는 대신 공개 경계에서 현재 설정을 반영한다. 실제 내부 ID는 업무 계산과 본인/권한 있는 운영 조회에 유지한다.

| 검사 | 결과 |
| --- | --- |
| 핵심 privacy·기존 회귀 | 116/116. 탈퇴·명시 재로그인·자동 동기화 부활 방지·사용 중 계정·복구/탈퇴 race·실제 ROFL/MMR 불변·고유 공개 UUID backfill |
| 게시 재예약 | 신규8+기존 게시8+privacy23=39/39, 마지막 범위 보완 후 신규8 재통과. 같은 현재 채널/기존 메시지만 수정·유실/교체/전달불명 차단·예약 실패 전체 롤백. 위116과 중복 포함, 합산하지 않음 |
| 공개 표현 | 신규5+기존41=46/46,0012 뒤 신규5 재통과. 12종 DTO의 원문·아바타·스냅샷/추가 순위·UUID/legacy·현재 관리자 경계·이력만 남은 사용자·독립 설정 |
| HTTP | 본인 action2+공개 조회2=4/4. CSRF·정확한 값·다른 대상 위조·탈퇴303/쿠키/모든 세션·익명 SSR와 페이지 데이터·권한 예외 |
| 브라우저 | 본인4+동일 세트 상세 갱신4+빠른 재열기2=10/10. 양 폭/테마·실패503/입력 보존·중복·탈퇴 확인 취소/확정·실제2세트/MMR20행 보존 |
| 공통 사용처 | SwitchCell의 본인 설정·헤더 화면 모드·관리자 모집 하드 피어리스 Space·상태·비활성·0불필요 POST. 순위 키는 공개 설정 변경에도 안정적인 identityKey 사용 |
| 프로젝트 검사 | 웹445/봇80, 테스트 타입, check/브랜딩/포맷·웹/봇 build 통과. hydration 수정 뒤 웹 재빌드·Svelte 오류0/경고0·본인4 재검증 |

**실화면:** [before4](../../artifacts/ui-review/backlog/03-privacy/before/captures.json), [after16](../../artifacts/ui-review/backlog/03-privacy/after/captures.json), [열린 상세8](../../artifacts/ui-review/backlog/03-privacy/after-detail/captures.json), [본인 MCP4](../../artifacts/ui-review/backlog/03-privacy/mcp-own/captures.json), [공개 MCP20](../../artifacts/ui-review/backlog/03-privacy/mcp-public/captures.json), [경매 MCP4](../../artifacts/ui-review/backlog/03-privacy/mcp-auction/captures.json)의56장을 실제 판독하고 SHA·역할·실행 URL·담당을 기록했다. 공개 MCP20은 8종×두 폭과 정상 redirect4장이다. 경매는 별도 실제 ROFL 이력/비공개 후보 fixture로 추가 확인했다. 총10종을 검토·재검증했고 직접 UI 코드는 내 정보·홈 순위·경기 상세3종과 공통 SwitchCell을 수정했다. 원래20종 전체를 새로 촬영한 것으로 합산하지 않는다.

새 hydration 오류는 SSR200 이후 발생하는 effect 반복으로 구분해 원본 참조를 raw state로 수정했다. 그 외 Kit3 상대 Location·wildcard Accept·실제 스냅샷 이름·고정 host 높이0·자료 도착 전 이동은 자동화 가정을 바로잡았다. 빠른 재열기는 실제 h2/닫기 버튼과 재Escape/포커스 복귀로 정상임을 확인해 SDK 결함으로 남기지 않는다.

**한계:** Svelte 공식 MCP는 제공되지 않아 설치 공식 compiler/svelte-check·STDF 실제 소스/타입·실제 Chromium으로 검증했다. 외부 CDN/폰트 요청은 차단했으므로 깨진 챔피언 이미지·대체 글꼴을 제품 회귀로 집계하지 않는다. 공개 주요 화면은 primary 양 폭, 본인·상세·경매는 양 테마이며 물리 기기·Safari·음성 청취·정량 CWV는 미검증이다. 이미 받은 외부 복사본·채널 이동·유실 글의 즉시 회수는 보장하지 않는다.0011/0012는 격리 DB에서만 적용했고 실제 Discord 전송·사용자 DB·배포는 변경하지 않았다.

프로필 비공개·탈퇴의 별도 공개 UUID는 과거 전적 연결을 유지하기 위한 구현 기본값이다. 사용자에게 확정받은 범위와 구분해 [작업표](../remaining-implementation.md#3-탈퇴공개-설정)에 기록한다. 기존 외부 복사본·채널 이동·유실된 글의 즉시 삭제는 보장하지 않으며 실제 Discord 발송/사용자 DB 변경은 수행하지 않는다.


## 4. 경기 목록의 기간·시즌 필터

| ID | 근거·우선순위 | 변경·완료 조건 | 상태 |
| --- | --- | --- | --- |
| BK-04 | 경기 목록에 검색만 있고 합의된 기간·시즌 필터가 없음. before4·코드 직접 확인 | 전체 시즌 기본 보존·같은 서버 시즌·KST 양 끝·검색/쪽 조합·명시 날짜 없는 행을 추정하지 않음 | DB·HTTP·브라우저 완료 |
| BK-04a | DB는 생성 시각, 화면·목·문서는 실제 경기일을 사용해 순서가 어긋날 수 있음. 코드 직접 확인. P1 | 기존 표시일=min(completed startedAt)을 집계해 정렬·기간·페이지에 같은 값 사용, null 마지막·동률 안정성 | 신규/기존 DB15 통과 |
| BK-04b | 새 복합 필터의 잘못된 기간·0결과·쪽 범위 밖·중복 조회 상태. P1 | 선택은 초안, 조회에서 원자 적용·오류 후 수정·이전 결과 유지·단일 GET·조건 보존/page 초기화·0/범위밖 구분 | HTTP3·최종 browser6·MCP4 완료 |
| BK-04c | 첫 구현의 props effect가 page 이동 때 미제출 검색 초안을 덮음. 실제 현재 빌드에서 재현, 이번 구현 중 회귀. P1 | 적용된 원시 조건의 signature가 바뀔 때만 동기화. 같은 query의 page 이동 뒤 미제출 초안 보존 | 실제 실패 재현→수정→웹 재빌드→동일4조건 재통과 |

Impeccable layout·clarify는 검색/날짜/시즌을 한 조회 과업으로 묶고 실제 경기일/미확인 날짜를 구분하는 데, adapt·harden은 native 날짜 입력·KST 공유 검증·실패/범위 밖/중복 상태에 적용한다. 기존 SeasonSelector를 실제 같은 책임에 한해 확장하며, 기존 홈·개인 전적·통계의 즉시 조회 기본 동작을 보존한다. 설치 STDF Input에 date 타입이 없어 날짜만 native input을 쓰고 브라우저 달력·키보드·기존 테마 color-scheme를 유지한다.

**코드:** `features/matches/filters.ts`, `server/matches/queries.ts`, 경기 목록 loader/화면·`MatchFilters.svelte`, 기존 `SeasonSelector.svelte`, 목 목록과 기존 목 회귀, 공유 HTTP fixture·새 DB/HTTP/browser tests다. 새 외부 endpoint·migration·시즌 목 UUID는 추가하지 않았다.

| 검증 | 결과 |
| --- | --- |
| DB 신규6·기존 match-read5·record-seasons4 | 15/15. KST 시작 포함/종료 배타·윤년/오류/역전·표시 min 시각·null·시즌/검색/쪽·동률 안정성·전체 empty 유지 |
| 관련 목/시즌 lite | 10/10. 시즌[] 보존, 기간·같은 시각 ID순·날짜 미확인 마지막 |
| HTTP | 3/3. 실제3ROFL+명시 날짜 seed, 결과/MMR 불변, 기본 전체/명시 시즌/다른 서버·빈 값400/404·기간 오류200+수정 가능한 자료 |
| 브라우저 | 새4+기존 SeasonSelector3사용처 회귀2=6/6. 양 폭/테마·초안 원자 GET·q/date/season 보존/page 초기화·0결과·오류수정·중복·늦은 응답·미제출 초안+쪽 이동 |
| 실제 MCP | 4/4. 키보드·메뉴·page2·실제 날짜/null, POST0·JS오류0·가로 넘침0.1440 primary는 과거 시즌 page99→총1쪽 ‘첫 페이지로’ 복구도 추가 확인 |
| 프로젝트 | 웹446/봇80·check·check:tests·웹/봇 build 통과. 초안 수정 뒤 웹 재빌드·앱 check 오류0/경고0·browser6/MCP4 재검증 |

[before4](../../artifacts/ui-review/backlog/04-match-filters/before/captures.json)·[최종 after12](../../artifacts/ui-review/backlog/04-match-filters/after/captures.json)·[MCP4](../../artifacts/ui-review/backlog/04-match-filters/mcp/captures.json)의20장 모두 실제 판독·SHA·역할/실행 URL/담당을 기록했다. 실제 ROFL 결과와 별도로 명시한 격리 DB 날짜/동률·쪽 테스트 자료를 구분하며, ROFL에 없던 시각을 추출했다고 주장하지 않는다. 긴 시즌 이름은 말줄임 대신 줄바꿈을 유지하고,4조건의 DOM/키보드 순서를 배치와 일치시켰다. 경기 목록1종을 직접 수정하고 공통 선택기의 홈·선수·통계3종도 재검증했다.

최저/최고 유효 연도의 실제 PostgreSQL 바인딩도 별도 격리 진단으로 정상 확인했으며 기존15개 검사 수에 더하지 않는다. 성능 개선율·CWV를 측정했다고 보고하지 않는다. 원본 화면의 생성 시각 정렬을 표시 시각으로 일치시킨 의미 변경은 위 BK-04a 근거와 테스트로 검증했다.

사용자 DB·실제 Discord·배포를 변경하지 않았다. 모든 fixture/세션/임시 자료는 정리했고5173 개발 서버는 유지했다. 외부 이미지/폰트 차단·Chromium viewport/키보드 검증이며 물리 기기·Safari·스크린리더 음성·운영 데이터 규모는 미검증이다.


## 5. 웹 시즌 관리

| ID | 근거·우선순위 | 변경·완료 조건 | 상태 |
| --- | --- | --- | --- |
| BK-05 | 기존 시즌 운영은 봇 명령만 있고 웹 경로 없음. before4/실제 소스 확인 | 관리자 시즌 탭·현재/과거 조회·확인 후 전환, 기존 봇 서비스와 receipt·내전/MMR 보존 | 구현·DB18·HTTP9·browser8 완료 |
| BK-05a | 새 관리 폼의 이름·확인·실패·경합·권한 변경. P1 | 100자/긴 영문, 확인 취소0POST, 단일 저장,409 새현재 재조회/입력 보존/재확인,503 보존, 성공 피드백 | HTTP9·browser4·MCP4 완료 |
| BK-05b | 네 번째 관리 항목의 좁은 화면과 무활성/빈 과거 상태 | 기존 헤더/본문 중복 이동 없음,4항목 키보드·포커스, 활성없음 조작 비활성/초기 설정 안내·임의 초기화 금지 | 양 폭/테마·새4/기존4 회귀 완료 |

봇/웹에 실제 중복될 시즌 전환은 공통 서비스로 추출했다. Impeccable clarify·harden은 전환 대상/기록 보존·CAS·실패 복구에, adapt·typeset·polish는4탭과 긴 이름·현재/과거·버튼/포커스에 적용하고 document로 실제 규칙을 병합했다. [before4](../../artifacts/ui-review/backlog/05-guild-seasons/before/captures.json)은 실제 관리자 멤버 화면이며 아직 존재하지 않던 시즌 탭의 before라고 주장하지 않는다. 실제 ROFL/현재·과거 시즌은 metadata에서 확인한다.


**5단계 코드·검증:** `features/seasons.ts`, `server/guild/seasons.ts`, 기존 `discord/bot-seasons.ts`, 관리자 load/actions·`GuildSeasonManagement.svelte`·4탭 조립·무활성 목, DB/HTTP/browser test다. 기존 봇 receipt를 tx 안에 유지하고 웹은 현재 시즌 CAS로 중복/동시 전환을 거절한다. 새 migration/범용 API는 없다.

| 검사 | 결과 |
| --- | --- |
| 신규 DB8·기존 bot6/record4 | 18/18. 현재/빈 상태·fresh 권한·100자/같은 이름·현재UUID/미래시각·web/web/web-bot CAS·저장 실패 rollback·이전 결과/새 내전 귀속·receipt 재사용 |
| 신규 HTTP7·기존 bot HTTP2 | 9/9. 비로그인/멤버/서비스운영자/위조 거절·CSRF·부분자료 비공개·no-store·현재 변경·native POST tab/입력 보존·503 upstream의 기존502 계약 |
| 신규 browser4 | 4/4.1440×1000/390×844 primary/dark. 취소0POST·409 뒤 새현재 자동조회·입력100자 보존·503 보존·단일 POST·성공/빈 입력 포커스·무활성 비활성·기존30MMR/ROFL/내전 동일 |
| 기존 admin browser4 | 4/4. 네 항목이 추가된 상태의 기존 멤버·Discord·이력·계정 관리 경로. 빠른 확인의 초기 포커스 검사를 보강한 뒤 재검증 |
| 실제 MCP | 4/4. 실제 전환1회·나머지 확인취소·100자 영문 textRange bounds·4탭44px/한 선택·JS0/가로넘침0. [행 전체 불변 해시](../../artifacts/ui-review/backlog/05-guild-seasons/mcp/fixture-checks.json) retainedEqual=true |
| 프로젝트 | 웹446/봇80·check·check:tests·웹/봇 build 통과. Svelte 오류0·경고0 |

[before4](../../artifacts/ui-review/backlog/05-guild-seasons/before/captures.json)·[after12](../../artifacts/ui-review/backlog/05-guild-seasons/after/captures.json)·[MCP4](../../artifacts/ui-review/backlog/05-guild-seasons/mcp/captures.json)의20장 모두 실제 판독·SHA·역할·URL·담당을 기록했다. 공통 확인창의 긴 이름 위험은 실제100자 영문으로 가시 범위·키보드를 확인해 CSS를 추가하지 않았다. 현재·과거·전환은 한 열의 별개 책임으로 배치하고 보존/1500 안내를 확인창에서 반복하지 않는다.

초기 HTTP 검증의 Kit3 node.error/status·Accept·기존 Discord upstream 상태 변환 가정을 정정했고 생산 결함으로 집계하지 않는다. 기존 계정 해제 회귀에서 한 조건의 빠른 확인 응답 대기 timeout이 있었으며 안전한 ‘취소’ 초기 포커스 완료를 검사한 뒤 확인하도록 자동화를 보강해4조건 통과했다. 이 때문에 제품 코드를 바꾸지는 않았다.

실제 Discord/사용자 DB/배포는 변경하지 않았고 모든 fixture·세션·schema·private args/config를 정리했다. 외부 이미지/폰트 차단·Chromium 키보드/viewport이며 Safari·물리 기기·음성 청취·CWV·운영 규모는 미검증이다.


## 6. 통계 자동 갱신

| ID | 근거·우선순위 | 변경·완료 조건 | 상태 |
| --- | --- | --- | --- |
| BK-06 | 합의된 자동 갱신 미구현, 실제 before4/코드 확인 | 같은 필터의 실제 기록 재조회·단일 요청·30초 재예약·수동/중지·숨김/오프라인 중지·늦은 응답 차단 | DB20/unit7·HTTP6·browser6 통과 |
| BK-06a | 조회 실패 시 마지막 정상 화면·정렬/쪽/열린 순위 보존 필요. P1 | 15초 timeout·60/120초 backoff·재시도·빈 자료/항목 감소 때 안전한 쪽/선택 보정 | HTTP6·browser6 통과 |
| BK-06b | SSR와 live 병합 수명에서 무관 URL/상위 자료 갱신이 최신 통계를 되돌릴 여지. 구현 중 코드 검토. P1 | 의미 있는 필터의 정규 요청 문맥과 실제 child 자료 갱신만 교체, hash/무관 query에서도 최신 결과 유지 | hash/무관query 실제 client 이동 뒤 최신2게임 유지 검증 |

Impeccable harden·adapt·clarify·polish로 실패/중지/복구·모바일 조작·갱신 시각/피드백과 상태 보존을 다룬다. 서버 조회는 extract로 SSR/live에 공유하고, 범용 API를 추가하지 않는다. 자동 요청만 low priority를 쓰며 지연 개선율이나 CWV를 측정한 것으로 보고하지 않는다. 관련 코드는 `features/stats/types.ts`, `server/stats/snapshot.ts`, `ui/stats-live.ts`, 통계 loader/화면·`stats/live`·`StatsRefreshControls.svelte`·`LeaderboardTable.svelte`, records의 additive identityKey와 새 DB/HTTP/browser/unit tests다.

- DB 신규5·기존 기록11/시즌4의20개, controller unit7, HTTP 신규4/기존시즌2의6개, browser 신규4/기존시즌2의6개가 통과했다. 실제500은 격리 테이블을 일시 변경해 재현·복구하고 같은 요청 정상 JSON도 확인했다. nullable 자료 fixture의 FK 제거 순서는 테스트 준비 가정으로 보정했으며 제품 결함으로 집계하지 않는다.
- 실제 ROFL1→2게임 polling, 같은조건 정렬/필터 보존, hash/무관query 실제client 탐색,503/60초 backoff·15초 timeout·singleflight·pending 중지·중지중 수동·자동복귀·hidden/offline·이동뒤 늦은 응답 차단을 확인했다. 별도 명시 UI주입은30행/20챔피언/업적2개로 page/sort/열린B→항목감소/전체empty→복귀를 검증한다. 운영 업적 활성화나 실제 API 결과로 설명하지 않는다.
- 기본 검사 `pnpm test`는 웹453/봇80, Svelte 오류0/경고0·테스트 타입·웹 build를 통과했다. 최종 전체 검사와MCP4도 통과했다. detector는 새 primary0, 기존 리더보드10px 배지의 문서화된 보조 크기 advisory1을 유지했다. 무시 규칙은 새로 추가하지 않았다.


[before4](../../artifacts/ui-review/backlog/06-stats-live/before/captures.json)·[after12](../../artifacts/ui-review/backlog/06-stats-live/after/captures.json)·[MCP4](../../artifacts/ui-review/backlog/06-stats-live/mcp/captures.json)의20장은 실제 판독·SHA·역할·URL·상태를 기록한다. before/MCP는 전체·min1·실제3게임의 같은 화면 상태 비교이고 fixture의포트/UUID는 서로 다르다. after의 실제1→2게임/min2/top 기능 검증과 별도 명시 UI주입을 같은자료 golden으로 주장하지 않는다. root도 실제 desktop/mobile 캡처를 읽고 단일조작·공유헤더/푸터·정렬focus·좁은 표를 확인했다.

이 단계는 웹 build·`pnpm check`·`pnpm check:tests` 통과이며 봇 소스는 변경하지 않았다. 외부 이미지/폰트는 차단됐고 물리기기·Safari·스크린리더 음성·정량성능·운영 규모는 미검증이다. API가 내려주는 업적은 계속false/[]이며 UI주입은 정책 확정이 아니다. 사용자 DB/Discord/배포는 변경하지 않고 fixture·세션·schema·private args는 정리했으며5173을 유지한다.


## 7. 포지션별 선호 챔피언

| ID | 근거·우선순위 | 변경·완료 조건 | 상태 |
| --- | --- | --- | --- |
| BK-07 | 선호 테이블/경매 표현 계약은 있지만 본인 편집과 실제 연결이 없음 | 실제 카탈로그·본인만·5포지션·max10·순서·해당lane 원자교체·현재후보 연결 | 구현·관련94·HTTP8·browser8·MCP8 완료 |
| BK-07a | 저장 실패/탈퇴/자료 장애·모바일/키보드 경계. P1 | 다른lane 초안 보존·단일 저장·실패 입력·재조회·unknown 보존/삭제·탈퇴후 재생성 차단 | 관련94·HTTP8·browser8 완료 |
| BK-07c | native 중복POST를 서버가400으로거절한뒤 failure 초기배열의중복key가 hydration에서500화면으로전환.1440primary실제재현. P1 | 서버중복거절유지·UI오류초기선택만고유키복원·DB불변·오류안내/제거동작유지 | 수정후durable native browser1 통과 |
| BK-07b | STDF type=search는 실제 type=text/inputmode=search라 신규 focus fallback이 마지막 제거 뒤 입력을 찾지 못함. 실제390 dark 재현. P1 | 서비스 검색 영역의 실제 입력을 선택해 마지막 제거/검색 결과 소멸 후 포커스 복원 | 수정 뒤4조건의 마지막 제거→검색 포커스 통과, 기존privacy4도 통과 |

Impeccable layout·clarify·adapt·harden·polish로 한 포지션의 검색→선택/순서→저장 흐름과 처음/실패/다량/좁은 화면을 구성한다. 기존 SelectionTabs·STDF Input/Button·PageNav를 우선 사용하고 선호와 실제 사용 챔피언을 구분한다. 카탈로그/정리 규칙은 실제 구현·검증 뒤 DESIGN과 관련 문서에 병합한다.


7단계 코드: `features/me/champions.ts`, `server/accounts/champions.ts`, 실제 카탈로그 parser/getter·resolver,0013/schema/meta, `/me` loader/action·`ChampionPreferences`·중앙 목·탈퇴 목 정리, 기존 `auction-profile`/`getAuction`와 SSR/live 및 현재후보 표현이다. 새 외부 endpoint는 없고 포지션 선택은 실제 출전·주력 포지션을 덮지 않는다.

관련 단일실행94/94는 개인선호10·auction-profile10(신규2 포함)·auction19·account-privacy23의 DB62와 기존 Data Dragon contract32다. HTTP 신규6/기존privacy2의8개, 기존privacy browser4도 통과했다.0013 기존11개를 손실 없이 backfill하고 같은lane 동시저장·서로다른lane·탈퇴 두 우선순서·INSERT실패 rollback·unknown 보존을 확인했다.44테이블/104FK는 유지하고 실제 Drizzle generate 재검사에서 “No schema changes”였다.

첫 브라우저의 searchbox 가정과 catalog 오류의 옛 문구·경매 상세 버튼의 잘못된 group scope는 자동화 가정으로 정정했다. 신규 focus fallback 문제(BK-07b)는 실제 재현한 제품 회귀로 별도 수정했다. source detector는 새 primary0·기존 경매의11px 보조 크기 advisory5를 유지했고 새 무시 규칙을 추가하지 않았다. 최종 브라우저는 신규4+기존privacy4의8개, MCP8조건을 통과했다.


[before6](../../artifacts/ui-review/backlog/07-champion-preferences/before/captures.json)·[after12](../../artifacts/ui-review/backlog/07-champion-preferences/after/captures.json)·[MCP8](../../artifacts/ui-review/backlog/07-champion-preferences/mcp/captures.json)의26장을 실제 판독·SHA·역할/상태/실행URL로 기록했다. root도 desktop/mobile10개 초안·503 보존·320px 줄바꿈·공개경매를 직접 읽었다.14개 실제형 catalog는 검색2쪽과 검색/포지션 변경 첫쪽을 확인하는 격리 override며 운영 fixture의 외부 이미지/폰트는 차단했다.768px3열·320px버튼다음줄44px·720 CSS폭·reduced-motion 피드백을 확인했고 실제200%브라우저줌/음성청취/CWV로 확대하지 않는다.

`pnpm test` 웹453/봇80, 앱Svelte 오류0/경고0·테스트 타입·웹 build를 통과했다. `pnpm check` 전체 검사도 통과했고 마지막 초기오류 정규화 뒤 앱검사/웹 build·테스트 타입·native 회귀를 재검증했다. 사용자 DB에는0013을 적용하지 않았고 실제 Discord·배포를 변경하지 않았다. 알려진 카탈로그 밖 ID는 본인 목록에서 유지/제거 가능하며 공개경매에는 실제 매핑된 항목만 표시한다. 별도실행의 원문이름/버튼scope·카탈로그옛문구 가정은 제품회귀와 구분했다.


최종 harden에서 발견한BK-07c는 서버의400 계약을 바꾸지 않고 실패 초기값의 UI 복제에만 Set을 적용해 고쳤다. [native-before1](../../artifacts/ui-review/backlog/07-champion-preferences/native-before/captures.json)·[native-after1](../../artifacts/ui-review/backlog/07-champion-preferences/native-after/captures.json)은 같은1440×1000 primary·중복103,103으로 실제400→500전환과 수정뒤400안내/고유1행·제거1개를 비교한다. native durable1을 포함해관련browser는9/9이며 PNG는총28장이다. 원래DB266·ordinal·createdAt을 보존하고 실제제거조작·JS0을 확인했다. 공개 전후26장은 정상/오류저장·경매 상태 증거로 유지하며 native재현/수정2장과 구분한다. 모든 fixture·소유schema·개인tmp를 정리했고5173은 유지했다.
