# 서버 기능 구조

[백엔드 구현 계획](../../../../../docs/backend-plan.md)의 기능 경계를 코드 옆에 둔다.
각 기능 폴더의 README는 구현한 모듈과 후속 책임을 설명한다. 인증·서버별 계정·모집·수동 편성·경매·대진·진행 상태와 경기·전적·통계·순위 조회는 DB에 연결했다.
내부 MMR 반영·역분개 서비스는 구현했다. ROFL 영구 등록과 결과 저장 흐름의 MMR 호출·봇 게시 업무는 후속 작업이다.

| 위치 | 책임 |
| --- | --- |
| [auth/](auth/README.md) | Discord OAuth·DB 세션·실행자 문맥·사용자/서비스 운영자 guard |
| `guild/` | 길드·멤버·설정·홈 조회. 기존 `ranking.ts` 활용 |
| [accounts/](accounts/README.md) | Riot 계정 조회·서버별 사용자 연결·대표 지정·연결 해제 |
| [scrims/](scrims/README.md) | 내전·신청·단계 전환·수동 편성·경매·대진 |
| [matches/](matches/README.md) | 경기 조회·검증된 ROFL 결과 등록·시리즈 집계 |
| [mmr/](mmr/README.md) | Game별 MMR 반영·안전한 마지막 Game 역분개 |
| [records/](records/README.md) | 현재 시즌의 개인 전적·통계 조회. 정의되지 않은 업적·평점은 미노출 |
| [discord/](discord/README.md) | 봇 통신·동기화·게시 작업 |
| `riot/`, `ddragon/`, `rofl/` | 기존 외부 API 클라이언트·카탈로그·ROFL 파서와 적재 모델 |
| `db/`, `errors.ts`, `actions.ts`, `status.ts` | DB 연결·스키마·트랜잭션 타입, 공통 업무 오류·action 변환, 상태 조회 |

공통 스캐폴드는 다음 경계를 제공한다.

- `auth/types.ts`: `Actor`의 `userId`, `isServiceAdmin`.
- `auth/guards.ts`: `requireUser`, `requireServiceAdmin`. 길드 소속·관리 권한을 대신하지 않는다.
- `errors.ts`: `DomainError`의 명시적 `code`, `status`, `message`와 선택적 `errors`.
- `actions.ts`: 업무 오류와 Discord 오류를 SvelteKit `fail`로 바꾸는 `actionFailure`. Discord 재시도 대기 헤더를 전달하고 다른 오류는 다시 던진다.
- `db/types.ts`: Drizzle의 `Database`, `Transaction` 타입.

`hooks.server.ts`는 요청 ID를 만들고 DB 세션을 `App.Locals.actor/user/session`에 복원한다.
`guild/access.ts`는 공개 조회와 조작 권한을 구분하며, 실제 Discord 권한 확인 후 쓰기 트랜잭션에서 활성·소속·신선도를 재검사한다.

`actionFailure`의 기본 반환은 `code`, `message`, 선택적 `errors`다.
기존 폼의 `positionsError`·`riotIdError`처럼 별도 필드가 필요하면 해당 라우트에서 명시적으로 변환한다.
Riot·ROFL 오류와 `Retry-After` 등 기존 응답 계약을 이 어댑터에 일괄 통합하지 않는다.

라우트는 요청 파싱과 세션 문맥 전달, 응답 변환을 담당한다. 기능 안의 `queries.ts`는 부수 효과 없이 화면 DTO를 조회하고,
`service.ts`는 입력·권한·소속·현재 상태 검증과 쓰기 트랜잭션을 담당한다. 파일은 실제 책임이 생길 때 만들며 모든 폴더에 같은 틀을 강요하지 않는다.

각 기능은 Drizzle을 직접 사용한다. 여러 기능을 함께 변경할 때 최상위 업무 함수가 트랜잭션을 열고 하위 함수에 `tx`를 전달한다.
업무 함수는 `RequestEvent`, `FormData`, SvelteKit `fail`에 의존하지 않는다. 화면과 공유할 DTO·순수 규칙은 `lib/features/`에 둔다.

생성·조회·수정·삭제 책임을 구분하되 취소·철회·이력 무효화는 상태 수정으로 처리한다.
현재 form action을 유지하며 실제 독립 소비자가 없는 HTTP API, 범용 CRUD 계층, 목 데이터로의 운영 fallback은 추가하지 않는다.
권한·서버별 계정·MSM1 준용의 확정 정책과 ROFL 등 후속 연결 범위는 [계획의 정책 항목](../../../../../docs/backend-plan.md#9-확정-정책과-후속-결정)을 따른다.
