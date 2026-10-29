# Riot API 연동

현재 서비스에 필요한 **계정 식별·참가자 프로필·개인 랭크·화면 표시용 정적 데이터**만 제공한다.
Riot 조회 5개와 Data Dragon 2개 라우트 패턴이며 모두 `GET`이다.
페이지·봇에서 이 조회를 사용하는 흐름과 계정 연결 저장은 아직 구현하지 않았다.

외부 API 추가 기준은 [프로젝트 규칙](../AGENTS.md#project-principles)을 따른다.
사용처가 정해지지 않은 일반 전적·관전·숙련도·전체 리그·Clash·Challenges 등의 조회는 제공하지 않는다.
내전 경기 기록 처리와 Riot 계정 조회는 별도 책임이다.

## 현재 사용 범위

아래 경로는 MSM2 웹 서버 기준이다. 경로의 이름·태그·PUUID는 각각 URL 인코딩한다.

| 경로 | 필요한 서비스 기능 |
| --- | --- |
| `/api/riot/account/v1/accounts/by-riot-id/[gameName]/[tagLine]` | 계정 입력 시 Riot ID를 식별하고 PUUID 확보 |
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
Data Dragon은 Riot API Key 없이 공식 CDN에서 읽는다.

## 서버 구조와 응답

- `src/lib/server/riot/transport.ts`: 호스트·입력 제한, 타임아웃, 동시 요청 및 429 처리
- `src/lib/server/riot/account.ts`: 계정 조회
- `src/lib/server/riot/lol/summoner.ts`, `league.ts`: 프로필·개인 랭크 조회
- `src/lib/server/ddragon/`: 정적 데이터 조회·캐시·이미지 URL 생성

HTTP 경로와 서버 내부 호출은 같은 조회 함수를 사용한다. 응답의 핵심 구조를 검증하고 추가 필드는 보존한다.
개인 랭크의 `leagueId`는 실제 응답에서 생략되므로 선택 필드다.

Riot 응답은 `Cache-Control: no-store`이며 자동 재시도하지 않는다. 한 서버 프로세스에서 최대 8개 요청을
동시에 실행하고, 429의 `Retry-After` 동안 해당 호스트 요청을 멈춘다. 헤더가 없으면 60초를 사용한다.
Data Dragon은 버전 목록을 5분, 버전별 카탈로그를 24시간 캐시한다. 메모리 캐시는 최대 64개이며
같은 URL의 동시 요청을 합친다. 실패 응답은 캐시하지 않는다.

오류 형식은 `{ "error": { "code": "...", "message": "..." } }`다.
잘못된 입력은 400, 데이터 없음은 404, 제한 초과는 429, 키 미설정·Riot 인증 실패·동시 요청 초과는 503,
upstream·응답·네트워크 오류는 502, 시간 초과는 504다. API Key와 upstream 오류 본문을 반환하지 않는다.

현재 조회 라우트에는 MSM2 사용자 인증·길드 권한 검사가 없다. Riot ID 조회는 계정 소유권 증명이 아니며,
사용자 계정 연결·권한 검사는 해당 기능 구현에서 다룬다. 제한·캐시는 프로세스별로 동작한다.

## 검증

`pnpm --filter @msm2/web test`는 실제 키와 외부 네트워크 없이 입력·응답·오류·라우팅·캐시를 검증한다.
`pnpm check`와 `pnpm build`에도 실제 키가 필요하지 않다.

명세 참고: [ACCOUNT-V1](https://developer.riotgames.com/apis#account-v1),
[SUMMONER-V4](https://developer.riotgames.com/apis#summoner-v4),
[LEAGUE-V4](https://developer.riotgames.com/apis#league-v4),
[Data Dragon](https://developer.riotgames.com/docs/lol#data-dragon).
