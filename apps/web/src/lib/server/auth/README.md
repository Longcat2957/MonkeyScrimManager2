# 인증과 실행자

Discord OAuth + PKCE와 DB 세션 저장·복원·로그아웃을 제공한다.
서버 공개 조회·실제 소속·관리 권한은 `../guild/access.ts`, Discord 응답 검증·동기화는 `../discord/`가 담당한다.

- `types.ts`: 서버가 인증한 실행자의 Discord 사용자 ID와 서비스 운영자 여부. 화면 표시용 `SessionUser`와 분리한다.
- `guards.ts`: 미인증은 401, 서비스 운영 권한 부족은 403의 `DomainError`로 거절한다.
- `oauth.ts`: identify scope·state·PKCE·고정 callback·내부 복귀 경로를 검증하고 확인 후 OAuth 토큰을 폐기한다.
- `session-core.ts`: 세션 난수·해시·만료·표시 사용자 변환 규칙.
- `session-store.ts`: 주입한 DB로 세션·사용자를 원자적으로 저장하고 조회·만료·폐기한다. 실제 웹과 hard DB 테스트가 같은 구현을 사용한다.
- `session.ts`: 기존 웹 함수 이름을 유지하고 저장 모듈에 런타임 DB를 연결한다.
- `hooks.server.ts`: 요청 식별자를 생성하고 실제 세션을 `locals.actor/user/session`에 복원한다.

실행자를 폼·헤더·목 권한에서 구성하지 않는다. 서버 라우트와 서비스는 세션 실행자로 guard를 호출한다.
서비스 운영자 여부는 길드·내전 권한을 대신하지 않는다. 일반 서버 열람은 공개하고 본인 신청·관리 조작을 별도로 검사한다.
로그인·로그아웃은 세션 자원의 생성·삭제로 구현하며, 조회는 로그인 정보를 새로 만들지 않는다.
