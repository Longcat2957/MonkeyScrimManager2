# 서버 관리 요청 오류 로그 계획

서버 관리자가 `/g/[guildId]/admin?tab=errors`에서 자기 Discord 서버의 웹 요청 오류를 확인하고, 문의할 때 요청 ID를 전달할 수 있게 한다. 수집 지점은 기존 `hooks.server.ts`다. [현재 서버 훅](../apps/web/src/hooks.server.ts)

## SvelteKit 서버 훅

| 훅 | 기록 조건 | 예시 |
| --- | --- | --- |
| `handleError` | SvelteKit이 요청 처리 중 던져진 오류를 훅에 전달하면 Kit의 `kind`와 오류 상태를 기록한다. `unknown`은 Kit 기본값인 500을 쓴다. | `error(403, ...)` → 403, 처리되지 않은 `TypeError` → 500 |
| `handle` | `await resolve(event)`가 돌려준 Fetch `Response`의 `status`가 400~599이면 기록한다. | 폼의 `return fail(409, ...)` → 409, API가 직접 반환한 503 응답 → 503 |

설치된 SvelteKit 3.1.0은 서버의 `handleError`에 `app`, `framework`, `validation`, `unknown`을 전달한다. 오류 응답만 받은 경우에는 `kind`를 비워 둔다. 두 훅에서 같은 요청을 관측하면 기존 `event.locals.requestId`를 고유 키로 한 행에 기록하고, `handleError`가 알려준 오류 상태와 종류를 우선한다. 리다이렉트는 두 기록 조건을 모두 통과하지 않는다. [SvelteKit 훅](https://svelte.dev/docs/kit/hooks#handleError) · [폼 액션](https://svelte.dev/docs/kit/form-actions#Validation-errors) · [Fetch 표준의 Response.status](https://fetch.spec.whatwg.org/#dom-response-status)

### 수집 범위

- 페이지 데이터 요청의 최종 응답이 200이어도 SvelteKit에서 예외를 `handleError`에 전달하면 기록한다.
- `load`에서 실패를 직접 잡아 대체 데이터를 반환하고 200으로 끝내면, 훅에는 성공 응답만 보인다. 이미 `observedSection`이 기록하는 부분 실패는 기존 운영 로그에서 확인한다. [기존 요청 관측](../apps/web/src/lib/server/operations/context.ts)
- SvelteKit이 앱 훅 호출 전에 직접 거부한 요청, 브라우저 예외, 백그라운드 워커·봇·프록시 오류는 이 관리자 탭의 수집 범위 밖이다.

## 저장과 열람 권한

- PostgreSQL에는 요청 ID, 발생 시각, 검증된 길드 ID, 메서드, 라우트 템플릿, 오류 상태, SvelteKit의 오류 종류만 보관한다. 원본 URL·쿼리·본문·쿠키·예외 메시지·스택은 저장 대상에서 제외한다. 보관 기간은 30일을 제안한다. 저장 실패는 기존 운영 로그에 남기고 원래 요청 처리를 계속한다. [운영 로그 정책](deployment.md)
- 길드는 서버에서 확인한 요청 문맥으로 귀속한다. URL의 길드 ID만 있거나 특정 길드에 속하지 않는 오류는 길드 관리자에게 노출하지 않는다. 조회에는 기존 변경 이력과 같은 관리자 검사와 길드 조건을 적용한다. [길드 변경 이력 조회](../apps/web/src/lib/server/guild/audit.ts)

## 관리 화면

- 기존 관리 메뉴의 ‘변경 이력’ 옆에 ‘오류 로그’ 탭을 추가한다. 이 탭을 열 때만 조회하고, 최신순 20건씩 표시한다.
- 행에는 발생 시각과 요청 경로·메서드·오류 상태를 표시한다. 상세에서 요청 ID를 복사할 수 있게 한다. 기존 관리 패널, 모바일 배치, 빈 상태, 조회 실패 시 재시도, 페이지 이동 패턴을 재사용한다. [기존 변경 이력 화면](../apps/web/src/lib/components/admin/GuildAuditHistory.svelte) · [관리 화면 규칙](web/pages/guild.md)

## 구현 순서와 확인 기준

1. 두 서버 훅에 저장을 연결한다. 던져진 403과 500, 일반·향상된 폼의 409, 직접 반환한 503이 요청 ID당 한 번씩 기록되는지 확인한다. 정상 응답·리다이렉트·내부에서 복구한 200은 목록에 추가되지 않아야 한다.
2. 저장·만료와 관리자 조회를 검증한다. 다른 길드와 귀속 미확인 요청이 목록·건수에 섞이지 않는지, 관리자 권한을 회수하면 조회가 거부되는지, 로그 저장이 실패해도 원래 상태와 응답 본문이 유지되는지 확인한다.
3. 데스크톱·모바일에서 정상·빈 목록·조회 실패·페이지 이동을 확인한다. 실제 응답의 `X-Request-ID`로 목록의 동일한 요청을 식별할 수 있어야 한다.
