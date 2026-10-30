# 웹 프론트엔드 문서

작성일: 2026-10-30. 대상: `apps/web` 화면을 구현하는 개발자·에이전트.

이 폴더는 **무엇을 어떤 STDF 컴포넌트로 만드는지**를 정한다.
업무 정책(권한·경매 규칙 등)이 아직 정해지지 않은 부분은 각 페이지 끝의 `미결정`에만 적고, 화면 설계는 그 결정과 무관하게 확정한다.

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
3. **데이터** — `+page.server.ts`의 `load`가 준비해 넘길 값. 컴포넌트는 이 값만 받는다.
4. **화면** — 데스크톱 와이어프레임과 모바일 차이.
5. **구성** — 영역별 사용 컴포넌트와 동작.
6. **상태** — 해당 페이지에 고유한 상태만. 공통 상태는 [patterns.md](patterns.md#1-상태-표현)를 따른다.
7. **미결정** — 구현 전에 정할 업무 정책.

## 용어

| 화면 문구 | 코드·문서 | 뜻 |
| --- | --- | --- |
| 서버 | guild | Discord 서버 하나 |
| 내전 | Scrim | 모집부터 종료까지의 운영 단위 |
| 경기 | Match | 한 내전 안에서 두 팀이 치르는 BO 시리즈 |
| 게임 | Game | 시리즈를 구성하는 한 판. 결과는 ROFL에서 기록 |
| 운영자 | 내전 운영 권한 보유자 | 해당 내전의 참가자·편성·대진을 조작할 수 있는 사람. 부여 기준은 미결정 |
| 서버 관리자 | `guild_members.is_admin` | 해당 서버의 설정·멤버 관리 |
| 서비스 운영자 | `users.isServiceAdmin` | 서비스 전체 운영. 서버 관리자와 서로 대체하지 않음 |

화면 문구에는 왼쪽 열을 쓴다. `Scrim`, `Match` 같은 영문 용어를 사용자에게 노출하지 않는다.

## 상태 값의 화면 문구

DB enum과 화면 문구를 한 곳에서 대응시킨다. 구현은 `lib/features/labels.ts`에 있고 `StatusTag`의 `state`도 함께 둔다.
목록에서 **내** 신청 상태는 따로 `신청함`·`선발됨`·`대기 중`(`MY_REGISTRATION`)으로 쓰고 철회·제외는 표시하지 않는다.

| enum | 값 → 문구 · `Tag state` |
| --- | --- |
| `scrim_status` | `recruit` 모집 중 · theme / `preparing` 편성 중 · info / `ready` 대진 준비 · info / `in_progress` 진행 중 · warning / `completed` 종료 · success / `ended_early` 중도 종료 · error / `cancelled` 취소 · error |
| `scrim_registration_status` | `pending` 신청 · theme / `selected` 선발 · success / `standby` 대기 · info / `withdrawn` 철회 · (Tag 없이 흐린 텍스트) / `excluded` 제외 · error |
| `match_status` | `pending` 대기 · theme / `in_progress` 진행 중 · warning / `completed` 종료 · success / `ended_early` 중도 종료 · error / `cancelled` 취소 · error |
| `auction_status` | `setup` 준비 · theme / `in_progress` 진행 중 · warning / `completed` 완료 · success / `cancelled` 취소 · error |
| `auction_lot_status` | `open` 진행 중 / `sold` 낙찰 / `unsold` 유찰 / `cancelled` 취소 |
| `lol_position` | `top` 탑 / `jungle` 정글 / `mid` 미드 / `bot` 원딜 / `support` 서폿 |
| `scrim_formation_method` | `manual` 수동 / `auction` 경매 / `null` 미정 |

## 서비스 전체의 미결정 정책

여러 페이지에 걸친 정책이다. 결정되면 해당 페이지 문서의 `미결정`에서 지우고 본문에 반영한다.

| 정책 | 정할 내용 | 영향 페이지 |
| --- | --- | --- |
| 열람 범위 | 비로그인·서버 비소속자의 열람 허용 범위, 개인 공개 설정과의 관계 | 서버 하위 전체 |
| 운영 권한 | 내전 생성·운영·ROFL 업로드 권한의 부여·회수 | 내전, 경기 상세 |
| 계정 연결 | Riot 계정 소유권 확인, 연결 충돌, 해제 조건 | `/me`, 참가 신청 |
| 상태 전이 | 모집 마감·편성 확정·시작·종료·취소의 조건과 담당 화면 | 내전, 경기 상세 |
| 예외 복구 | ROFL 참가자 연결 실패·결과 충돌의 처리 담당과 위치 | 경기 상세, 관리 |
| 접근 거부 응답 | 비공개 자원에 403과 404 중 무엇을 줄지 | 전체 |

## 근거 문서

[프로젝트 목적](../purpose.md) · [DB ERD](../database-erd.md) · [ROFL 적재 모델](../rofl-import.md) · [MMR](../mmr.md) · [Riot API](../riot-api.md) · [AGENTS.md](../../AGENTS.md)
