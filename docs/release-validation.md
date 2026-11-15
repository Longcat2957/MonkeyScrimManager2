# 최신 릴리스 통합 검증

2026-11-16. 시작 커밋 `ee1e5d8`. 확정된1~8개 구현의 개별 검사와 별도로 전체 CI·브라우저·최신 migration의 격리 배포/복원을 확인한다. 법적 본문·운영 업적/평점 기준의 사용자 보류와 운영 DB·실제 Discord/OAuth·메일 발송·실제 배포 제외는 유지한다.

## 시작 근거

[실제 push CI](https://github.com/Longcat2957/MonkeyScrimManager2/actions/runs/43731623595)는 기본 검사·타입·웹453/봇80·봇 빌드를 통과했으나 hard520개 중1개가 실패했다. `actions.test.ts:364`는 중도 종료 후 재개이며, 연결 계정이 없는 참가자를 복구하려는 fixture에 대한 정상409다. 브라우저·격리 배포 단계는 실패로 건너뛰었다. 이 결과를 개별 검사 전체 성공으로 확대하지 않는다. [정리된 CI 근거](../artifacts/release-validation/baseline-ci.json)에 원시 환경/자격 증명 없이 기록한다.

## 실행 과업

| ID | 과업·완료 조건 | 상태 |
| --- | --- | --- |
| RV-01 | 수동 편성 HTTP fixture의 정상 계정/서버 연결을 준비하고 복구·권한 규칙 유지. 실제409/DB불변 재현→관련 전체검사→전체hard 재검증 | 원본409/11테이블 불변 재현·fixture 수정 뒤 HTTP47 및 전체hard520/520 통과 |
| RV-02 | 최신 코드의 browser 전체를 실행하고 실제 기능 결함/오래된 테스트 전제/동기화 오류를 구분해 필요한 곳만 수정 | 최초61 중59 통과/2 실패. 원인 재현·수정 뒤 전체61/61 통과 |
| RV-03 | 현재 journal0013까지 새DB에 적용. 실제 구조의 합성 업무행·모든 테이블 hash/FK/sequence·컬럼 type/default/NOTNULL 복원, TLS·CSRF·내부 차단·SIGTERM과 소유 자원 정리 | 0013까지 실제 migration·합성업무16행/10테이블·전체복원 일치·TLS/CSRF/차단·정리 통과 |
| RV-04 | 전체check/타입/unit/build·hard/browser·격리 배포와 수정 push의 원격CI를 분리해 실제 결과 기록 | 로컬 전체 통과. 원격은 해당push Actions로 별도 확인 |

모든 fixture는 전용 테스트 schema 또는 직접 만든 label/tmpfs 컨테이너만 사용한다. 사용자 DB를 migration하거나 백업 자료를 복사하지 않는다. 실제 자격 증명·URL·쿠키·비밀 키·원시 오류는 결과 파일에 넣지 않는다. 개발 서버5173은 유지한다.


## 확인한 원인과 수정

- RV-01: 수동 편성 자체는 성공했다. 중도 종료 뒤 재개 시 계정/현재 서버 연결이 없는 참가자를 복구하려 해 정상409가 났다. 해당 HTTP fixture에 canonical Riot 계정·서버 연결·참가자 계정만 준비했다. 서비스의 복구/권한 규칙은 변경하지 않았다.
- RV-02a: 공개 경매 fixture의 후보 userId가 null이라 현재 개인정보 정책대로 `삭제된 사용자`가 표시됐다. live200·올바른lot·JS오류 없음과 옛이름 locator 실패를 확인했다. 해당 읽기 검사의 후보만 같은 서버 활성 사용자로 연결했고 익명사용자의 과거이름을 다시 노출시키지 않았다.
- RV-02b: 모바일 시즌 메뉴에서 첫 rAF 포커스가 locator의 대상 focus와 실제 Enter 사이에 끼어 현재시즌을 선택했다. 실제 trace로 재현하고 메뉴의 첫 활성 버튼에 최초 포커스가 완료된 조건을 기다리게 했다. timeout·정적sleep·조회/입력보존 assert·제품 코드는 변경하지 않았다.
- RV-03: 이전 배포 검사의 업무 테이블은 비어 있었다. 새 검사기는 직접 만든 DB에만 가짜 공개/비공개/탈퇴 사용자·연결·세션·감사·선호 순서를 넣고 모든 테이블 hash·열 자료형/default/NOTNULL/identity/generated까지 비교한다. 실제 사용자 자료를 복사하지 않는다.


## 격리 배포 결과

[실제 결과](../artifacts/release-validation/deployment.json)는 업무44테이블, migration/probe를 포함한 전체47테이블·전체FK105(업무104+probe1)·제약302개·컬럼395개를 비교했다. 모든 행 hash·sequence·제약·열 자료형/default/NOTNULL/identity/generated가 원본과 일치했다.16개 업무 표본은10개 테이블에 들어 있으며 실제 사용자 자료가 아니다.

백업/검증파일0600·덮어쓰기/확인누락/기존DB/손상hash 거절·실패파일정리를 통과했다. 실제 nginx와 자체서명 로컬TLS에서 공개200·HTTP308·내부경로404·정상origin405/다른origin403·위조헤더덮어쓰기·크기413·SIGTERM0·OAuth쿼리로그제외를 확인했다. systemd는 정적검사이며 실제서비스를 등록/기동하지 않았다. 자체label 컨테이너2개와 임시파일은 정리했고 실제VPS/공인TLS/운영DB/외부발송을 대신하는 인증으로 보고하지 않는다.


## 전체 로컬 게이트

| 검사 | 결과 |
| --- | --- |
| `pnpm check` | format/branding·웹Svelte 오류0/경고0·봇 타입 통과 |
| `pnpm check:tests` | 웹·봇 테스트 타입 통과 |
| `pnpm test` | 웹453·봇80, 실패/건너뜀0 |
| `pnpm test:hard` | 새 웹 build와 전체520/520, 실패/건너뜀0 |
| `pnpm test:browser` | 새 웹 build와 전체17파일61/61, 실패/건너뜀0 |
| `pnpm build:bot` | 통과 |
| `verify_deployment.mjs` | 0000~0013·합성업무16행·47전체테이블/395컬럼·복원/TLS/정리 통과 |

[정리된 검사·소스 해시](../artifacts/release-validation/checks.json)와 [실제 재현/수정 근거](../artifacts/release-validation/corrections.json)를 따른다. 부분47/1/4 검사는 원인을 좁힌 보조 검사이며 전체520/61에 더하지 않는다. screenshot 환경을 설정하지 않아 기존 UI 검증의66장과 해시는 덮어쓰지 않았다. 이번 작업은 테스트 fixture·키보드 준비 동기화와 검증 도구 변경이며 제품 동작·권한·개인정보 공개 규칙을 변경하지 않았다.

원격 결과는 [해당 push의 Actions 실행](https://github.com/Longcat2957/MonkeyScrimManager2/actions?query=branch%3Amain)에서 commit을 맞춰 확인한다. 위 표는 로컬 실행이며 원격 성공을 대신하지 않는다. 이 문서의 `ee1e5d8` 실패는 수정 전 기준 실행으로 보존한다.
