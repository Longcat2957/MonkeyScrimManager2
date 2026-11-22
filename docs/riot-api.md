# Riot API 연동

현재 서비스에 필요한 **계정 식별·ROFL 참가자 확인·참가자 프로필·개인 랭크·경매 후보의 솔로랭크 요약·화면 표시용 정적 데이터**만 제공한다.
공개 HTTP 경로는 Riot 조회 5개와 Data Dragon 2개 패턴이며 모두 `GET`이다. 경기 목록과 상세는 서버 내부 수집 작업만 사용한다.
Data Dragon은 서버 홈·순위·경기·전적·통계 등 화면 로더에서 실제 조회한다.
서버 관리의 계정 조회·연결은 실제 Riot Account 조회와 LoL 활성 플랫폼 확인을 사용한다.
확인한 계정 식별자는 DB에 보존하고 소유 연결·대표 선택은 서버별 `guild_riot_accounts`에 저장한다.
봇의 참가 신청도 웹 내부 API를 통해 같은 서버별 연결을 사용한다. 봇 애플리케이션이 Riot API나 DB에 직접 접근하지 않는다.

외부 API 추가 기준은 [프로젝트 규칙](../AGENTS.md#project-principles)을 따른다.
사용처가 정해지지 않은 일반 전적·관전·숙련도·전체 리그·Clash·Challenges 등의 조회는 제공하지 않는다.
내전 경기 기록 처리는 `matches/`가 담당하며, ROFL의 Riot ID를 실제 PUUID로 확인할 때 기존 서버 내부 Account 조회 함수를 사용한다.
정상 ROFL에서 확정 라인업·진영·포지션으로 출전자와 실사용 계정을 확인하면 결과와 함께 서버별 연결을 저장한다. 기존 소유자나 대표 계정은 덮어쓰지 않는다. 식별·충돌·중복 조건은 [ROFL 적재 문서](rofl-import.md#자동-귀속과-경기-운영)를 따른다.

## 현재 사용 범위

아래 경로는 MSM2 웹 서버 기준이다. 경로의 이름·태그·PUUID는 각각 URL 인코딩한다.

| 경로 | 필요한 서비스 기능 |
| --- | --- |
| `/api/riot/account/v1/accounts/by-riot-id/[gameName]/[tagLine]` | 계정 입력 시 Riot ID를 식별하고 PUUID 확보. ROFL 처리는 같은 서버 내부 조회 함수를 사용 |
| `/api/riot/account/v1/accounts/by-puuid/[puuid]` | 등록된 참가자의 현재 Riot ID 표시·갱신 |
| `/api/riot/account/v1/region/by-game/lol/by-puuid/[puuid]` | 참가자의 LoL 플랫폼 확인 |
| `/api/lol/summoner/v4/summoners/by-puuid/[puuid]` | 참가자 프로필 아이콘·레벨 표시 |
| `/api/lol/league/v4/entries/by-puuid/[puuid]` | 참가자 개인 랭크 표시 |
| `/api/ddragon/versions` | 표시용 정적 데이터의 버전 확인 |
| `/api/ddragon/[version]/[locale]/[resource]` | 경기 상세·참가자 화면에 필요한 이름·이미지 데이터 |

Data Dragon의 `resource`는 `champions`, `items`, `runes`, `summoner-spells`, `profile-icons`다.
`version`은 명시적인 패치 버전, `locale`은 `ko_KR` 같은 언어 코드다.
룬 카탈로그는 배열이고 나머지는 `data` 맵을 가진 객체다. 챔피언·아이템·스펠·프로필 이미지와
룬 아이콘은 `ddragon/assets.ts`의 URL 생성 함수를 사용한다. 별도 이미지 프록시는 없다.

모집 마감 시 경매 후보용 수집 작업은 현재 솔로랭크와 최근 솔로랭크 챔피언을 독립적으로 갱신한다.
각 항목은 마지막 성공 후 40분 동안 다시 조회하지 않는다. 최고 티어는 전체 경력이 아니라 이번 시즌 서비스가 관측한 값이다.
Match-V5의 `/lol/match/v5/matches/by-puuid/{puuid}/ids`에 `queue=420&count=20`을 고정하고, 최신순 목록에 있는 경기의 상세(`/lol/match/v5/matches/{matchId}`)를 읽는다.
경기 ID·큐·PUUID가 일치하는 참가자의 챔피언만 집계한다. 사용 횟수가 같으면 더 최근에 쓴 챔피언이 앞선다. 원본 경기 응답을 저장하거나 공개하지 않는다.

## 환경 변수와 라우팅

실제 값은 Git에서 제외되는 `apps/web/.env`에 설정한다. 예시는 `apps/web/.env.example`이다.
개발 서버와 `pnpm start`는 웹 디렉터리의 `.env`를 읽는다. 값을 변경하면 서버를 재시작한다.

| 변수 | 기본값 | 용도 |
| --- | --- | --- |
| `RIOT_API_KEY` | 없음 | 서버 요청의 `X-Riot-Token` 헤더 |
| `RIOT_ACCOUNT_REGION` | `asia` | Account 조회 지역 클러스터 |
| `RIOT_PLATFORM` | `kr` | 참가자 프로필·개인 랭크 조회 플랫폼 |
| `RIOT_API_TIMEOUT_MS` | `10000` | Riot 요청 제한 시간, 1–60000ms |

Account의 `?region=...`, 프로필·랭크의 `?platform=...`으로 요청별 기본값을 바꿀 수 있다.
Account 지역은 `asia`, `americas`, `europe`를 지원한다.
LoL 플랫폼은 `br1`, `eun1`, `euw1`, `jp1`, `kr`, `la1`, `la2`, `me1`, `na1`, `oc1`, `ru`, `sg2`, `tr1`, `tw2`, `vn2`를 지원한다.
Account 조회 지역과 응답의 LoL 활성 플랫폼은 서로 다른 값이며 자동 변환하지 않는다.
Match-V5는 계정 조회 지역 설정을 재사용하지 않는다. LoL 플랫폼에서 `asia`(KR·JP1), `americas`(BR1·LA1·LA2·NA1), `europe`(EUN1·EUW1·ME1·RU·TR1), `sea`(OC1·SG2·TW2·VN2) 중 하나를 선택한다.
Data Dragon은 Riot API Key 없이 공식 CDN에서 읽는다.

## 서버 구조와 응답

- `src/lib/server/riot/transport.ts`, `rate-budget.ts`: 호스트·경로 제한, 타임아웃, 동시 요청 및 시간창별 예산 예약
- `src/lib/server/riot/account.ts`: 계정 조회
- `src/lib/server/riot/lol/summoner.ts`, `league.ts`: 프로필·개인 랭크 조회
- `src/lib/server/riot/lol/match.ts`: 솔로랭크 20경기 목록과 경기별 참가자·챔피언 확인
- `src/lib/server/ddragon/`: 정적 데이터 조회·캐시·이미지 URL 생성

HTTP 경로와 서버 내부 호출은 같은 조회 함수를 사용한다. 응답의 핵심 구조를 검증하고 추가 필드는 보존한다.
개인 랭크의 `leagueId`는 선택 필드다. 생략된 LP·승·패는 0으로 읽고, LP의 부호는 보존한다. 승·패는 음수를 허용하지 않는다.

공개 Riot 응답은 `Cache-Control: no-store`이며 전송 계층에서 자동 재시도하지 않는다.
현재 배포에서는 웹 프로세스 하나가 봇을 대신한 요청·웹 요청·수집 작업을 모두 전송한다. 동시 요청은 최대 8개다.
전송기는 지역 호스트별 `X-App-Rate-Limit[-Count]`, 같은 호스트 내 메서드별 `X-Method-Rate-Limit[-Count]`의 모든 시간창을 읽고 전송 전에 예산을 예약한다.
백그라운드는 각 한도의 10%(올림)를 사용자 요청용으로 남긴다. 한도가 1이면 수집도 한 건은 진행할 수 있다.
429의 `Retry-After` 동안 유형에 따라 해당 메서드·서비스·호스트의 새 요청을 막는다. 유형이 없으면 호스트 전체, 대기 시간이 없거나 잘못되면 60초를 적용한다.
프로세스를 재시작하면 첫 응답부터 예산을 다시 학습한다. 별도 프로세스나 웹 복제본이 같은 키를 쓰도록 확장하려면 먼저 호출을 한곳으로 모으거나 예산·429 대기 상태를 공유해야 한다.
Data Dragon은 버전 목록을 5분, 버전별 카탈로그를 24시간 캐시한다. 메모리 캐시는 최대 64개이며
같은 URL의 동시 요청을 합친다. 실패 응답은 캐시하지 않는다.

오류 형식은 `{ "error": { "code": "...", "message": "..." } }`다.
잘못된 입력은 400, 데이터 없음은 404, 제한 초과는 429, 키 미설정·Riot 인증 실패·동시 요청 초과는 503,
upstream·응답·네트워크 오류는 502, 시간 초과는 504다. API Key와 upstream 오류 본문을 반환하지 않는다.

기존 프로필·티어 조회용 HTTP 라우트는 공개 조회를 유지한다. 서버 관리 UI의 계정 조회·연결은 별도 업무 함수를 직접 호출하며,
현재 Discord 관리자 권한과 사용자별 분당 10회 조회 제한을 검사한다. 연결·대표 변경·해제는 대상의 현재 서버 소속도 검사한다.
Riot ID 조회는 계정 소유권 증명이 아니며, 서버 운영자가 해당 서버의 사용자 연결을 지정한다. 제한·캐시는 프로세스별로 동작한다.

## 검증

`pnpm --filter @msm2/web test`는 실제 키와 외부 네트워크 없이 입력·응답·오류·라우팅·캐시를 검증한다.
`pnpm check`와 `pnpm build`에도 실제 키가 필요하지 않다.

명세 참고: [ACCOUNT-V1](https://developer.riotgames.com/apis#account-v1),
[SUMMONER-V4](https://developer.riotgames.com/apis#summoner-v4),
[LEAGUE-V4](https://developer.riotgames.com/apis#league-v4),
[MATCH-V5](https://developer.riotgames.com/apis#match-v5),
[호출 제한](https://developer.riotgames.com/docs/portal#rate-limiting),
[Data Dragon](https://developer.riotgames.com/docs/lol#data-dragon).
