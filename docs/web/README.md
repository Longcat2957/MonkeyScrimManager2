# 웹 프론트엔드 문서

작성일: 2026-10-30. 코드 대조 갱신일: 2026-11-03. 대상: `apps/web` 화면을 구현하는 개발자·에이전트.

이 폴더는 **현재 코드가 어떤 화면과 동작을 제공하는지**를 기록한다.
설명과 코드가 다르면 코드가 기준이다. 화면·상태·라우트·액션은 실제 구현에 맞추고,
아직 연결되지 않은 기능과 후속 정책은 현재 동작과 구분한다.

실제 인증·영속 저장·ROFL 결과 전파를 연결할 구조와 단계별 작업은 [백엔드 구현 계획](../backend-plan.md)을 따른다.
해당 문서의 계획과 정책 제안은 이 폴더의 현재 구현 설명과 구분한다.

## 구현 경계

- Discord OAuth + PKCE, DB 세션 복원·로그아웃, 실제 소속·실효 관리 권한 검사를 연결했다. 일반 서버 화면은 비로그인·비소속자도 열람한다. 본인 신청·관리 화면·백오피스는 별도 권한 검사를 거친다.
- 모집·신청·설정·수동 편성·대진·시작·되돌리기·중도 종료는 DB 트랜잭션에 연결했다. 양 팀이 정해진 대진을 시작할 때 실제 Match를 생성한다. 경매의 설정·대기열·낙찰·유찰·수동 배치·되돌리기도 DB에 연결했다.
- Riot 조회·연결·대표 지정·해제는 실제 API와 서버별 연결 테이블을 사용한다. `/me`는 본인 계정을 서버별로 묶는다. 다른 서버의 연결·대표 여부·활성 신청을 변경하지 않는다.
- Discord 설정은 실제 역할·채널·봇 게시 권한을 조회하고 저장한다. 채널 overwrite·timeout과 설정 변경 후 실행자 권한을 확인한다. Discord 업무 게시·interaction은 남아 있다.
- 경기 목록·상세는 DB Match·Game·실출전을 공개 조회하고 누락 수치·시각·평점은 null로 유지한다. 개인 전적·서버 통계는 현재 활성 시즌의 유효 실출전을, 홈 순위는 현재 멤버의 해당 시즌·포지션 유효 반영 1게임 이상을 조회한다. 시즌·사용자가 확정된 미반영 포지션은 초기 MMR 1500이다. 실제 ROFL 업로드는 참가자 귀속·진영·순서 검증 전까지 `can.upload=false`·action 503으로 보류한다. 내부 MMR 반영·역분개 서비스는 구현했으며 ROFL 저장 흐름과의 연결은 남아 있다.
- Data Dragon 이미지·카탈로그, 백오피스의 DB/봇 상태는 실제 조회다. 목 화면은 명시적인 개발 샘플 서버·`?mock=1`에 한정하고 실제 데이터 실패에 대한 대체값으로 사용하지 않는다.


## 읽는 순서

| 순서 | 문서 | 내용 |
| --- | --- | --- |
| 1 | [routing.md](routing.md) | 라우트, 레이아웃 계층, 헤더·내비게이션, URL 상태 |
| 2 | [design-system.md](design-system.md) | STDF 설정, 토큰, 용도별 컴포넌트 선택표, 서비스 공통 컴포넌트, 알려진 STDF 제약 |
| 3 | [patterns.md](patterns.md) | 상태·폼·오버레이·목록·반응형·접근성 패턴과 완료 체크리스트 |
| 4 | [pages/](pages/) | 페이지별 화면 구성 |

| 페이지 문서 | 라우트 |
| --- | --- |
| [pages/global.md](pages/global.md) | `/`, `/me`, `/docs`, `/terms`, `/privacy`, `/backoffice`, `/dev/*`, 오류 화면 |
| [pages/guild.md](pages/guild.md) | `/g/[guildId]`, `/g/[guildId]/admin` |
| [pages/scrims.md](pages/scrims.md) | `/g/[guildId]/scrims/**` |
| [pages/records.md](pages/records.md) | `/g/[guildId]/matches/**`, `/players/[userId]`, `/stats` |

## 페이지 문서 형식

모든 페이지는 같은 순서로 쓴다. 해당 없는 항목은 생략한다.

1. **목적** — 이 페이지에서 사용자가 끝내는 일 한두 줄.
2. **권한** — 보기와 조작의 조건.
3. **데이터** — 현재 `load`가 준비하는 값과 데이터 출처. 컴포넌트가 받는 주요 계약을 적는다.
4. **화면** — 데스크톱 와이어프레임과 모바일 차이.
5. **구성** — 영역별 사용 컴포넌트와 동작.
6. **상태** — 해당 페이지에 고유한 상태만. 공통 상태는 [patterns.md](patterns.md#1-상태-표현)를 따른다.
7. **현재 한계·후속 작업** — 미연결 저장소·인증, 코드상 제한, 아직 정하지 않은 운영 정책.

## 용어

| 화면 문구 | 코드·문서 | 뜻 |
| --- | --- | --- |
| 서버 | guild | Discord 서버 하나 |
| 내전 | Scrim | 모집부터 종료까지의 운영 단위 |
| 경기 | Match | 한 내전 안에서 두 팀이 치르는 BO 시리즈 |
| 게임 | Game | 시리즈를 구성하는 한 판. 결과는 ROFL에서 기록 |
| 운영자 | 내전의 `canManage` | 해당 서버의 관리자 권한으로 참가자·편성·대진을 운영하는 사람. 실제 쓰기에서는 권한을 다시 확인 |
| 서버 관리자 | `GuildContext.isAdmin`, `guild_members`의 동기화 정보 | Discord 소유자·실효 서버 관리 권한 또는 설정한 운영자 역할 보유자. 관리 화면과 설정·계정 변경 권한 |
| 서비스 운영자 | `SessionUser.isServiceAdmin`, `users.isServiceAdmin` | 백오피스 접근. 길드 관리자 권한을 자동 부여하지 않음 |

화면 문구에는 왼쪽 열을 쓴다. `Scrim`, `Match` 같은 영문 용어를 사용자에게 노출하지 않는다.

## 상태 값의 화면 문구

내전·신청·경기 상태와 포지션은 `lib/features/labels.ts`에서 문구와 `StatusTag` 상태를 정의한다.
경매는 화면별로 상태를 해석하고, 백오피스 서비스 상태는 `lib/features/backoffice/status.ts`에서 별도로 정의한다.
목록에서 **내** 신청 상태는 따로 `선발됨`·`대기 중`(`MY_REGISTRATION`)으로 쓰고 철회·제외는 표시하지 않는다.

| enum | 값 → 문구 · `Tag state` |
| --- | --- |
| `scrim_status` | `recruit` 모집 중 · theme / `preparing` 편성 중 · info / `ready` 대진 준비 · info / `in_progress` 진행 중 · warning / `completed` 종료 · success / `ended_early` 중도 종료 · error / `cancelled` 취소 · error |
| `scrim_registration_status` | `selected` 선발 · success / `standby` 대기 · info / `withdrawn` 철회 · (Tag 없이 흐린 텍스트) / `excluded` 제외 · error |
| `match_status` | `pending` 대기 · theme / `in_progress` 진행 중 · warning / `completed` 종료 · success / `ended_early` 중도 종료 · error / `cancelled` 취소 · error |
| `auction_status` | `setup` 준비 · theme / `in_progress` 진행 중 · warning / `completed` 완료 · success / `cancelled` 취소 · error |
| `auction_lot_status` | `open` 진행 중 / `sold` 낙찰 / `unsold` 유찰 / `cancelled` 취소 |
| `lol_position` | `top` 탑 / `jungle` 정글 / `mid` 미드 / `bot` 원딜 / `support` 서폿 |
| `scrim_formation_method` | `manual` 수동 편성 / `auction` 경매. `null`은 방식 미선택으로, 요약의 선택 UI를 표시한다 |

일정과 날짜 표시는 `labels.ts`의 `Asia/Seoul` 기준이며 사용자별 시간대 설정은 없다.

## 서비스 전체 정책과 후속 작업

개발용 구현에서 제공하는 조작과 실제 운영 연동의 남은 작업을 구분한다.

| 정책 | 정할 내용 | 영향 페이지 |
| --- | --- | --- |
| 열람 범위 | 확정: 일반 서버 화면은 비로그인·서버 비소속자에게 공개 | 서버 하위 일반 조회 |
| 운영 권한 | 확정: 길드 관리자 운영·멤버 본인 신청. ROFL은 관리자 또는 실제 출전자이며 식별 검증 후 연결 | 내전, 경기 상세 |
| 계정 연결 | 확정: 서버별 운영자 지정·대표·해제. 해당 서버의 활성 신청 사용 계정만 해제 차단, 과거 출전 보존 | 서버 관리, 참가 신청, `/me` |
| 결과 전파 | 실제 Match 생성·상태 전이와 내부 MMR 서비스는 구현됨. ROFL 영구 등록·승자 진출·MMR 서비스 연결 검증은 후속 | 내전, 경기 상세·전적 |
| 예외 복구 | ROFL 참가자 연결 실패·결과 충돌의 처리 담당과 위치 | 경기 상세, 관리 |
| 외부 장애·실제 운영 검증 | 세션 만료·권한 회수·API 장애·동시 조작·재시작을 실제 설정과 브라우저에서도 확인 | 전체 |

## 근거 문서

[프로젝트 목적](../purpose.md) · [DB ERD](../database-erd.md) · [ROFL 적재 모델](../rofl-import.md) · [MMR](../mmr.md) · [Riot API](../riot-api.md) · [AGENTS.md](../../AGENTS.md)
