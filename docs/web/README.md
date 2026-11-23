# 웹 프론트엔드 문서

이 폴더는 Monkeybot 웹의 화면별 조작·권한·표시 정책을 설명한다. 화면 구현은 [`apps/web/src/routes`](../../apps/web/src/routes/), 시각 기준은 [Rift 원본 목업](../../apps/web/.impeccable/mocks/decision/rift-tactical.html)이다.

## 읽는 순서

| 문서 | 찾을 내용 |
| --- | --- |
| [제품 맥락](../../apps/web/PRODUCT.md) | 사용자·운영 흐름·제품 원칙 |
| [라우팅](routing.md) | 공개·보호 경로, 내비게이션, URL에 남기는 상태 |
| [디자인 시스템](design-system.md) | 테마·토큰과 공통 Svelte 컴포넌트 선택 |
| [화면 패턴](patterns.md) | 조회·변경·오류 복구, 접근성, UI 완료 기준 |

| 페이지 문서 | 라우트 |
| --- | --- |
| [pages/global.md](pages/global.md) | `/`, `/me`, `/docs`, `/terms`, `/privacy`, `/backoffice`, `/dev/*`, 오류 화면 |
| [pages/guild.md](pages/guild.md) | `/g/[guildId]`, `/g/[guildId]/admin` |
| [pages/scrims.md](pages/scrims.md) | `/g/[guildId]/scrims/**` |
| [pages/records.md](pages/records.md) | `/g/[guildId]/matches/**`, `/players/[userId]`, `/stats` |

## 용어

| 화면 문구 | 코드·문서 | 뜻 |
| --- | --- | --- |
| 서버 | guild | Discord 서버 하나 |
| 내전 | Scrim | 모집부터 종료까지의 운영 단위 |
| 경기 | Match | 한 내전 안에서 두 팀이 치르는 BO 시리즈 |
| 세트 | Game | 경기(BO 시리즈)를 구성하는 한 판. 결과는 ROFL에서 기록. 라인업은 경기 전체에서 재사용 |
| 운영자 | 내전의 `canManage` | 해당 서버의 관리자 권한으로 참가자·편성·대진을 운영하는 사람. 실제 쓰기에서는 권한을 다시 확인 |
| 서버 관리자 | `GuildContext.isAdmin`, `guild_members`의 동기화 정보 | Discord 소유자·실효 서버 관리 권한 또는 설정한 운영자 역할 보유자. 관리 화면과 설정·계정 변경 권한 |
| 서비스 운영자 | `SessionUser.isServiceAdmin`, `users.isServiceAdmin` | 백오피스 접근. 길드 관리자 권한을 자동 부여하지 않음 |

화면 문구에는 왼쪽 열을 쓴다. `Scrim`, `Match` 같은 영문 용어를 사용자에게 노출하지 않는다.

## 상태 값의 화면 문구

내전·신청·경기 상태와 포지션은 `lib/features/labels.ts`에서 문구와 `StatusTag` 상태를 정의한다.
경매는 화면별로 상태를 해석하고, 백오피스 서비스 상태는 `lib/features/backoffice/status.ts`에서 별도로 정의한다.
목록에서 **내** 신청 상태는 따로 `선발됨`·`대기 중`(`MY_REGISTRATION`)으로 쓰고 철회·제외는 표시하지 않는다.

| enum | 값 → 문구 · `StatusTag state` |
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

- 활성 서버의 일반 화면은 비로그인·비소속자도 볼 수 있다. 본인 신청은 현재 멤버만, 관리 작업은 현재 관리자만 가능하다. 서비스 운영 권한은 서버 관리 권한을 대신하지 않는다.
- 경기·MMR 이력은 보존한다. 공개 화면에는 본인의 프로필·Riot ID 공개 설정을 각각 적용한다. 비공개·탈퇴 후에도 옛 스냅샷으로 이름이나 계정을 복원하지 않는다.
- [시즌 칭호 15종](../season-titles.md)은 서버 홈·통계·개인 전적에서 같은 시즌 결과를 사용한다. 운영 배포는 별도 검증 대상이다. 그 밖의 미확정 업적·MVP·ACE·종합 평점은 제공하지 않는다. 약관·개인정보 처리방침의 법적 본문과 시행일도 미확정이다. 문의 이메일 확정은 법적 본문 승인이 아니다.
- 실제 인증, Discord 게시 및 운영 환경의 점검은 [배포 안내](../deployment.md)를 따른다. 개발 샘플과 실제 조회 결과는 구분하며, 실제 오류를 샘플로 대체하지 않는다.

## 근거 문서

[프로젝트 목적](../purpose.md) · [DB ERD](../database-erd.md) · [ROFL 적재 모델](../rofl-import.md) · [MMR](../mmr.md) · [Riot API](../riot-api.md) · [AGENTS.md](../../AGENTS.md)
