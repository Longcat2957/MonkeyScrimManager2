# 웹 프론트엔드 문서

작성일: 2026-10-30. 코드 대조 갱신일: 2026-11-03. 대상: `apps/web` 화면을 구현하는 개발자·에이전트.

이 폴더는 **현재 코드가 어떤 화면과 동작을 제공하는지**를 기록한다.
설명과 코드가 다르면 코드가 기준이다. 화면·상태·라우트·액션은 실제 구현에 맞추고,
아직 연결되지 않은 기능과 후속 정책은 현재 동작과 구분한다.

## 구현 경계

- 루트 로더는 개발 모드에만 목 사용자·서버를 제공한다. OAuth·세션 복원과 실제 서버 소속·권한 검사는 아직 연결하지 않았다.
- 내전·편성·대진·계정·서버 관리는 메모리 목 저장소로 동작한다. 목의 권한 플래그와 상태 검사는 실제 인증이나 DB 트랜잭션을 대신하지 않는다.
- 경기 상세는 샘플 및 업로드한 ROFL을 목 저장소에 표시한다. 대진의 실제 Match 생성, 업로드 결과의 대진·개인 전적·서버 통계·MMR 반영은 미연결이다.
- Data Dragon 이미지·카탈로그와 백오피스의 DB/봇 상태 확인은 실제 조회다. Riot 계정 연결 UI의 조회·저장은 목이다.
- 개발 외 모드의 빈 화면·401·403·404 응답과 화면별 제한은 [라우팅](routing.md) 및 각 페이지 문서에 명시한다.

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
| 운영자 | 내전의 `canManage` | 해당 내전의 참가자·편성·대진을 조작하는 목 권한. 실제 부여 기준과 인증 연결은 미구현 |
| 서버 관리자 | 현재 `GuildContext.isAdmin`, 스키마 `guild_members.is_admin` | 해당 서버의 설정·멤버 관리 화면 접근. 실제 Discord 역할·권한 동기화는 미구현 |
| 서비스 운영자 | 현재 `SessionUser.isServiceAdmin`, 스키마 `users.isServiceAdmin` | 백오피스 접근. 서버 관리자와 별도이며 개발 사용자에는 두 권한이 모두 있음 |

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

## 서비스 전체의 후속 작업

개발용 구현에서 제공하는 조작과 실제 운영 연동의 남은 작업을 구분한다.

| 정책 | 정할 내용 | 영향 페이지 |
| --- | --- | --- |
| 열람 범위 | 비로그인·서버 비소속자의 열람 허용 범위 | 서버 하위 전체 |
| 운영 권한 | 내전 생성·운영·ROFL 업로드 권한의 부여·회수 | 내전, 경기 상세 |
| 계정 연결 | 운영자 연결 시 소유권 확인 방법, 해제 조건 | 서버 관리, 참가 신청 |
| 상태 전이의 영속 저장 | 목 `workflow.ts`에 있는 단계별 조건을 실제 저장소·트랜잭션에 연결하고 경기 생성·결과 반영을 연결 | 내전, 경기 상세 |
| 예외 복구 | ROFL 참가자 연결 실패·결과 충돌의 처리 담당과 위치 | 경기 상세, 관리 |
| 접근 거부 응답 | 현재 라우트별 개발/운영 응답을 실제 로그인·서버 소속·자원 권한 검사와 연결 | 전체 |

## 근거 문서

[프로젝트 목적](../purpose.md) · [DB ERD](../database-erd.md) · [ROFL 적재 모델](../rofl-import.md) · [MMR](../mmr.md) · [Riot API](../riot-api.md) · [AGENTS.md](../../AGENTS.md)
