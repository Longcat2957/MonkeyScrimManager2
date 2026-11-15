# DB·ROFL 운영 안정성 검증

기준 HEAD는 `a98210a443f41819d33ac749c48701616c67fd8d`다. 이번 범위는 앱 DB 요청 제한, ROFL 입장·본문·파싱 제한, 요청 ID와 안전한 오류·처리 시간 관측이다. 업무 schema·외부 API·인증 규칙·ROFL의 자동 저장·중복/복구·MMR 계산 규칙을 새로 정의하지 않았다. 정상 파일은 기존 권한·참가자 연결 검증 뒤 자동으로 저장한다.

## 구현과 완료 조건

| ID | 확인한 문제·조건 | 적용 내용 | 검증 |
| --- | --- | --- | --- |
| OPS-01 | 앱 SQL·잠금 대기·전체 트랜잭션에 앱 전용 상한이 없었음 | PostgreSQL 17의 statement/lock/transaction/idle-in-transaction 제한. 추가 연결 점유 상한에서는 실제 연결 종료 | 실제 `pg_sleep`, 행 잠금, 미커밋 쓰기, 풀 재사용 DB 회귀 통과 |
| OPS-02 | ROFL 처리 요청이 동시에 쌓이고 동기 파서가 앱 thread에서 실행됨 | 프로세스/사용자별 동시성, 사용자별 기간 횟수, 즉시 429·Retry-After, 종료를 기다리는 worker | 실제 DB 잠금으로 첫 업로드를 유지한 상태의 두 번째 요청 429, 잠금 해제 후 두 세트·원장 20행 정상 저장 |
| OPS-03 | 본문과 파싱에서 응답만 끝내는 timeout은 실제 작업을 남길 수 있음 | 총 본문 제한은 reader 취소, 파싱은 worker terminate 완료 후 반환. 원본 바이트는 보존 | 실제 ReadableStream 취소·lock 해제, worker 1ms timeout·abort·terminate 확인 실패·정상 재시도 통과 |
| OPS-04 | 요청 오류를 묶어 추적할 ID와 안전한 공통 관측이 부족하고 부분 실패가 원시 cause를 출력함 | 서버 UUID, X-Request-ID, 고정 7필드 JSON, 알려진 오류 code. 부분 실패·프레임워크 기본 원시 오류 출력도 안전한 경계로 통일 | 실제 HTTP의 200/401/예상 밖 DB 오류500/복구200에서 사설 query·쿠키·가짜 token·실제 경로 ID·원시 SQL 미출력 확인 |
| OPS-05 | 풀의 acquire는 이전 요청 release 문맥에서 실행될 수 있음 | connect 호출 시점 recorder 캡처, 타이머·드라이버 이벤트는 그 요청에 귀속 | 포화 풀의 A→B 연결 전달 뒤 B 점유 종료는 B에만 DB_CONNECTION_TIMEOUT·503, A 오류 없음 |
| OPS-06 | client를 얻기 전 풀 대기/초기 연결 실패는 일반500으로 남았음 | client 없는 connect 실패만 원문/cause 없는 503·Retry-After1로 정규화. 일반 SQL 오류는 유지 | 실제 포화풀에서 Promise·callback 대기 만료 모두503, 대기 취소·연결 반환 후 정상 query. 기존 HTTP 일반 SQL 오류500도 재확인 |

실제 사용 설정과 운영 배포 시 한계는 [배포 문서](../../../docs/deployment.md#dbrofl-운영-제한과-요청-관측)에 기록했다. DB 잠금 5초 < statement 15초 < transaction/연결 점유 30초이며 연결 점유는 서버 종료 뒤 추가 1초 유예를 둔다. ROFL은 프로세스당 2요청, 사용자당 기본 min(2, 전역 한도), 12회/60초, 본문 30초, worker 시작 포함 파싱 5초가 기본이다. 0·잘못된 순서·전역보다 큰 사용자 동시성은 거절한다.

## 관련 파일

- DB: `apps/web/src/lib/server/db/{config,pool,index}.ts`, `apps/web/src/env.ts`, `apps/web/.env.example`.
- 파싱·입장: `apps/web/src/lib/server/rofl/{processing,processing-runtime,processing-worker}.ts`, `server/matches/{results,service}.ts`, 경기 `+page.server.ts`의 upload action. 기존 파서·identity·import-model·projection을 재사용한다.
- 관측·오류: `apps/web/src/hooks.server.ts`, `server/operations/{context,errors,section}.ts`, `server/{actions,http}.ts`, `server/discord/bot-http.ts`. 순수 `lib/features/section.ts`는 원시 cause를 출력하지 않고 길드 loader만 서버 관측 wrapper를 사용한다.
- 회귀: `tests/api/lite/operations.test.ts`, `tests/api/hard/{db,http}/operations.test.ts`. 기존 HTTP helper는 명시한 운영 설정 키만 주입하며 로그 원문을 반환하지 않는다.
- UI 입력 보존의 실제 브라우저 회귀는 Root 소유 `tests/browser/rofl-results.test.ts`의 두 폭×429/503 네 조건에서 확인한다. 이 문서는 그 결과를 별도 운영 단위 수와 합산하지 않는다.

## 실행 결과

실행 환경은 Node `24.22.3`, pnpm `10.20.0`, 설치된 pg `8.23.1`, adapter-node `6`, SvelteKit `3`다. 테스트용 DB schema만 생성·정리했고 외부 제공자 fetch는 기존 network guard/fixture를 사용했다. 실제 계정·운영 DB·실제 Discord/Riot 호출은 사용하지 않았다.

| 실행 | 결과 | 근거 |
| --- | --- | --- |
| 신규 운영 lite 8개 + 기존 오류 계약 14개 | 22/22 통과, 실패·skip 0 | `/tmp/msm2-next-ops-lite-final.log` |
| 신규 운영 실제 DB 5개 + 실제 HTTP 2개 | 7/7 통과, 실패·skip 0. 연결 입장 보완을 포함한 최종 공유 build 사용 | `/tmp/msm2-next-ops-hard-final2.log` |
| 테스트 타입 검사 | exit 0 | `/tmp/msm2-next-ops-testtypes-final.log` |
| 운영 관련 Prettier | 통과 | 신규 운영 소스·테스트 및 변경 helper 대상 |
| 최종 공유 `pnpm build` | 마지막 연결 입장 보완 포함 웹·봇 exit 0 | `/tmp/msm2-next-ops-final-build2.log` |
| 최종 production worker 직접 실행 | 준비·projection 각각 실제 참가자10명, Date/호출자 bytes 보존, 1ms timeout 후 MessagePort 0, 동일 bytes 재시도 성공 | `operations.json`의 productionWorker |

HTTP 마지막 회귀는 `ROFL_MAX_CONCURRENT=1`만 지정하여 사용자 동시성을 따로 지정하지 않아도 기본값1로 계산되는 설정 경계까지 확인했다. 실제 HTTP 검사는 manifest 경로만 기록하고 들어온 X-Request-ID를 신뢰하지 않으며 서버 UUID로 덮어쓰는 것도 확인했다. 예상 밖 SQL 오류를 만들기 위해 **자기 fixture schema의 테이블 하나만** 잠깐 rename한 뒤 finally에서 복구했다.

DB 회귀는 timeout 뒤 미커밋 insert·실패한 update가 남지 않고 새 요청이 같은 풀에서 정상 실행되는지 확인한다. 마지막 포화풀 검사는 반환 요청과 대기 요청을 별도 AsyncLocalStorage 문맥으로 만들어 잘못된 오류 귀속을 재현 가능하게 검사한다. worker 검사는 응답 Promise뿐 아니라 종료 후 실제 MessagePort 수까지 비교한다.

현재 전체 unit·DB·HTTP·브라우저 최종 합계와 UI 화면 증거는 [통합 작업 기록](../../../docs/ui-review/next.md)의 최종 게이트를 기준으로 한다. 이 문서의 부분 검증 수를 전체 합계에 더하지 않는다. 정규 재실행은 `pnpm test`, `pnpm check:tests`, `pnpm test:hard`, `pnpm test:browser`이며 hard/browser에는 별도 `TEST_DATABASE_URL`이 필요하다. 정규 실행기는 실제 자격 증명을 비우고 HTTP·브라우저 전에 새 웹 build를 만든다. 이번 공동 검증은 fixture 경합을 피하도록 위 공유 build 완료 뒤 파일별 실행만 수행했다.

## 보장 범위와 남은 운영 조건

- 제한은 한 Node 프로세스 안에서 적용된다. worker/replica 수만큼 합산 동시성과 사용자 횟수가 늘어난다. 배포 인스턴스 수·메모리·트래픽에 맞춰 한도를 정해야 하며 분산 limiter를 추가하지 않았다.
- worker의 JS heap은 64MiB다. ROFL ArrayBuffer는 외부 메모리여서 그 heap 제한과 별도이며 파일 크기·동시 요청 수로 함께 제한한다. 최대 허용 파일/동시성의 운영 capacity 부하 측정은 하지 않았고 성능 개선율도 주장하지 않는다.
- 본문은 70MiB, 개별 파일은 기존 64MiB다. 실제 reader 취소는 adapter-node에서 연결을 닫을 수 있어 408 응답 대신 네트워크 실패로 보일 수 있다. 이 경로는 실제 ReadableStream 취소로 검증했으며, 느린 실제 모바일 통신망/프록시 조합은 미검증이다.
- 관측의 `durationMs`는 응답 객체 생성까지의 서버 시간이다. 전체 body 전송 완료·CWV·DB 밖 후속 작업의 시간으로 해석하지 않는다. stdout/journal의 저장 권한·회전·보존, 알림과 대시보드는 운영 환경에서 정한다.
- 풀의 기존 최대10개·연결 대기10초는 유지한다. 회귀에서는 실제 포화풀의 공개 options로 대기 상한만35ms로 낮춰 Promise·callback의 503과 회복을 재현했다. 연결을 얻지 못한 오류만 정규화하고 이미 얻은 연결에서의 일반 SQL 오류는 기존500 경계로 유지한다.
- timeout으로 연결 응답을 잃으면 저장 성공을 추정하지 않고 새로고침해 현재 상태를 확인한다. ROFL 중복/채택본 복구와 확정 라인업·MMR 처리는 기존 서비스 경로를 유지한다.
- 실제 VPS 적용·공인 TLS·실제 OAuth/Discord 승인·명령 등록·게시/DM·Riot 자격 증명, 실제 사용자 ROFL, 물리 기기·스크린리더 음성은 미검증이다. 약관·개인정보 본문은 사용자 보류를 유지한다.

운영 안정성 검증에서 별도 화면을 추가하거나 screenshot을 생성하지 않았다. 429/503 파일·블루 팀 입력 보존은 위 브라우저 테스트와 통합 기록의 화면 증거를 참조한다. 환경 값·쿠키·원본 파일·DB dump·원시 MCP 자료·원시 서버 로그는 artifact에 저장하지 않는다.
