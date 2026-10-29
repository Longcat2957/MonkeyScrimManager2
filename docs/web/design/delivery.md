# 실행 계획 — 단계·PR·검증

작성일: 2026-10-29. 선행: [진단](audit.md) · [시스템](system.md) · [구조](architecture.md) · [컴포넌트](components.md) · [페이지](pages.md)

이 문서는 위 설계를 **어떤 순서로, 어떤 단위의 PR로, 무엇을 검증하며** 구현할지 정한다.
"문서만 늘고 화면은 그대로"인 이전 상태를 반복하지 않기 위해, **모든 단계는 화면으로 끝난다**.

## 1. 원칙

1. **P0이 끝나면 디자인이 바뀐다.** 토큰·셸·헤더를 한 PR에서 끝내 현재 화면의 인상을 먼저 바꾼다.
2. **각 PR은 독립적으로 배포 가능**하고, 병합 직후 `pnpm check`·`build`가 통과한다.
3. **데이터는 목으로 시작하되 계약은 실제와 같게** 만든다(`$lib/data/types.ts`가 DB enum과 1:1).
4. **새 페이지는 첫 PR부터 정상·로딩·빈·오류 4상태와 모바일 배치를 포함**한다. "나중에 상태"를 허용하지 않는다.
5. **문서는 코드와 함께 갱신**한다. 라우트·용어 변경은 `routing.md`·`page-requirements.md`에 반영한다.
6. 각 단계 종료 시 **이전 프로젝트(MSM1) 대비 개선점 1줄**을 changelog에 남긴다(무엇이 왜 나아졌는지).

## 2. 단계 개요

| 단계 | 목표 | 결과물 | 예상(인·일) | 의존 |
| --- | --- | --- | --- | --- |
| **P0** 기반 | 새 시각 언어가 화면에 적용된다 | 토큰·폰트·ConfigProvider·테마 부트스트랩·셸(헤더/레일/푸터)·오류 화면·`/dev/components` 뼈대 | 3 | — |
| **P1** 데이터·상태 | 모든 화면이 쓸 목·계약·상태 도구 | `$lib/data`(타입+목 어댑터)·`$lib/mocks`·`AsyncSection`·`PageHeader`·`DataTable`·`StatusTag`·`TaskDialog` | 3 | P0 |
| **P2** 전역 페이지 | 서비스의 첫인상 완성 | `/`·`/me`·문서 3종·`/backoffice`·404/403/500 | 3 | P1 |
| **P3** 서버 문맥 | 서버 단위 탐색 완성 | `/g/[guildId]`·`/scrims`·`/matches`·서버 선택기·관리 | 4 | P1 |
| **P4** 내전 | 내전 운영의 중심 화면 | 내전 요약·참가 신청/선발·편성 진입점 | 4 | P3 |
| **P5** 편성 | 가장 어려운 조작 | 엔트리 편성 보드·경매 콘솔·대진 | 5 | P4 |
| **P6** 기록 | 데이터 밀도 화면 | 경기 상세(성적표)·선수 전적·서버 통계 | 5 | P3 |
| **P7** 관리·마감 | 운영 화면과 품질 | 길드 관리·백오피스 실제 업무·접근성/성능 점검 | 3 | P2~P6 |
| **P8** 실데이터 연결 | 목 → 서비스 | 서비스 레이어·API·인증 연동 | 별도 계획 | P7 |

총 30 인·일(프론트 단독 1인 기준 추정). P5는 내부 정책(경매 규칙) 확정 없이 **UI 시뮬레이션까지만** 구현하고,
규칙 확정 후 제출 계약을 잠근다.

## 3. PR 단위 상세

### P0 — 기반 (PR 1~4)

| PR | 범위 | 변경·추가 파일 | 완료 판정 |
| --- | --- | --- | --- |
| P0-1 토큰 | `@theme`·의미 토큰·기저·유틸, `app.html` 테마 부트스트랩, 폰트 로딩 | `lib/styles/{tokens,base,utilities}.css`, `routes/layout.css`, `app.html` | 라이트·다크가 시스템 설정으로 시작되고 새로고침 깜빡임 0 |
| P0-2 셸 | 헤더(브랜드·서버 선택기 자리·모드·계정)·컨텍스트 레일·푸터·SkipLink·RouteFocus·ConfigProvider(ko_KR) | `lib/components/shell/*`, `routes/+layout.svelte`, `lib/shell/navigation.ts` | 18개 라우트 모두 헤더 1개, 44px 터치, 키보드 순회 |
| P0-3 오류·개발 | `+error.svelte` 재작성, `/dev/components` 뼈대(시나리오 전환), `/dev/error` 유지 | `routes/+error.svelte`, `routes/dev/components/*` | 403/404/500 각각 행동 1개, 개발 페이지는 운영 404 |
| P0-4 문서·정리 | 구 헤더·`AppFooter`·`.app-frame` 삭제, `AGENTS.md`·`routing.md` 갱신, changelog | 삭제 3, 문서 3 | 저장소에 옛 셸 코드 0줄, `pnpm check` 통과 |

**P0 검증:** 360/768/1280에서 헤더가 깨지지 않는다. 다크 모드에서 STDF 버튼이 시안(라이트)과 같은 의미로 보인다.
`/`가 워드마크 한 줄이 아니라 소개 화면으로 보인다(간이 버전).

### P1 — 데이터·상태 (PR 5~8)

| PR | 범위 | 파일 | 완료 판정 |
| --- | --- | --- | --- |
| P1-1 계약 | 뷰 모델 타입 + 목 어댑터 + 지연/실패/빈 주입 | `lib/data/{types,index,adapter.mocks}.ts`, `lib/mocks/*` | 8개 길드·내전·경기·선수·통계 표본이 서로 참조 일관성을 가진다 |
| P1-2 UI 기반 | `AsyncSection`·`PageHeader`·`SectionHeading`·`DataTable`·`StatusTag`(+`status.ts`)·`MetricList`·`FillMeter` | `lib/components/ui/*` | `/dev/components`에서 5상태를 전부 볼 수 있다 |
| P1-3 패널 | `TaskDialog`(포커스 트랩·Escape·복귀), `ConfirmDialog`, `Field`·`NativeField`·`ChoiceGroup` | `lib/components/ui/*` | 키보드만으로 열고 닫고 제출할 수 있다, 배경 조작 차단 |
| P1-4 갤러리 | 실제 컴포넌트 12종·상태·폭·테마 | `routes/dev/components/+page.svelte` | 디자인 회귀 기준 화면 확보 |

### P2 — 전역 페이지 (PR 9~12)

| PR | 화면 | 핵심 |
| --- | --- | --- |
| P2-1 | `/` | 히어로·3단계 흐름·개발 바로가기 분리 |
| P2-2 | `/me` | Riot 계정 목록·연결 패널·공개 범위 폼(목 저장) |
| P2-3 | `/docs`·`/terms`·`/privacy` | `DocumentPage` + 목차 |
| P2-4 | `/backoffice` | 확정 업무 없음 명시, 권한 게이트 자리 |

### P3 — 서버 문맥 (PR 13~16)

| PR | 화면 | 핵심 |
| --- | --- | --- |
| P3-1 | `/g/[guildId]` | 대표 내전 카드 + 목록 + 최근 경기, 두 영역 독립 실패 |
| P3-2 | `/g/.../scrims` | 목록·상태 필터·모집 생성 다이얼로그 |
| P3-3 | `/g/.../matches` | 검색·필터·페이지 URL 상태 |
| P3-4 | `/g/.../admin` | 멤버 표·권한 변경·설정 저장 |

### P4 — 내전 (PR 17~19)

| PR | 화면 | 핵심 |
| --- | --- | --- |
| P4-1 | `/scrims/[scrimId]` | `ScrimContextBar`·`NowLine`(역할별)·`RosterTable` |
| P4-2 | 참가 조작 | `RegistrationDialog`(신청/변경/철회)·`OperationsPanel`·`RegistrationHistory` |
| P4-3 | `/teams` | 방식 결정·리다이렉트·준비 조건 |

### P5 — 편성 (PR 20~23)

| PR | 화면 | 핵심 |
| --- | --- | --- |
| P5-1 | `/teams/manual` | 2단계 배치·로컬 초안·1회 커밋·검증 |
| P5-2 | `/teams/manual` (모바일) | 세로 배치·하단 선택 안내·터치 전용 확인 |
| P5-3 | `/teams/auction` | 후보 카드·팀 레일·낙찰/유찰·`AuctionLog` |
| P5-4 | `/bracket` | 라운드 열·경기 카드·편집 모드 |

### P6 — 기록 (PR 24~26)

| PR | 화면 | 핵심 |
| --- | --- | --- |
| P6-1 | `/matches/[matchId]` | `SeriesScore`·Game 링크·`ScoreboardTable`·선수 패널·피어리스 |
| P6-2 | ROFL | `RoflUploadDialog` 6상태 |
| P6-3 | `/players/[userId]`·`/stats` | 전적·MMR 막대·집계 표 |

### P7 — 마감 (PR 27~29)

| PR | 범위 | 핵심 |
| --- | --- | --- |
| P7-1 | 백오피스·관리 보강 | 권한 게이트, 미확정 업무 미노출 |
| P7-2 | 접근성 점검 | 키보드·스크린리더·표·폼·모션 감소 |
| P7-3 | 성능·정리 | 폰트·이미지·JS 예산, 콘솔 경고 0, 문서 최종 갱신 |

## 4. 검증 게이트

각 PR에서 실행한다.

```bash
pnpm check                 # 브랜딩 + svelte-check
pnpm --filter @msm2/web build
pnpm --filter @msm2/web test   # 기존 서버 로직 테스트 회귀
```

| 게이트 | 방법 | 실패 기준 |
| --- | --- | --- |
| 디자인 일관성 | `/dev/components`와 각 페이지를 라이트·다크로 비교 | 임의 색·임의 크기 발견 시 실패 |
| 상태 커버리지 | `/dev/components?scenario=empty\|slow\|error\|partial` | 한 상태라도 화면이 비거나 오류로 멈추면 실패 |
| 모바일 | 360px 실기기/에뮬레이터, 터치만 사용 | 편성·경매·성적표 중 하나라도 불가하면 실패 |
| 키보드 | Tab/Shift+Tab/Enter/Escape만으로 주요 업무 1회 | 포커스가 사라지거나 트랩 밖으로 나가면 실패 |
| 중복 | 화면 전체(헤더·본문·푸터·열린 패널)에서 같은 목적지·문장 검색 | 2회 이상이면 실패 |
| 브랜딩 | `pnpm check:branding` | 위반 1건 이상 |
| 성능 | Lighthouse 모바일(로컬 build+preview) | LCP > 2.0s, CLS > 0.05, 셸 JS > 180KB(gzip) |

향후 자동화(P7): Playwright로 5개 뷰포트 스크린샷 + 접근성 검사(axe)로 회귀를 잠근다.
도입 시 devDependency 1개만 추가하고, 실패 시 스크린샷 diff를 저장한다.

## 5. 기존 자산 정리

| 기존 | 처리 |
| --- | --- |
| `lib/components/layout/AppHeader.svelte` | 삭제 → `shell/AppHeader.svelte` 재작성 |
| `lib/components/layout/AppFooter.svelte` | 삭제 → `shell/AppFooter.svelte` |
| `routes/layout.css`의 `.app-frame`·색·테마 | `lib/styles/*`로 이동, `.app-frame` 삭제 |
| `routes/+layout.svelte`의 skip link·main 틀 | 재작성(ConfigProvider·RouteFocus 포함) |
| `dev` 바로가기의 임시 ID | `lib/mocks`의 실제 표본 ID로 대체 |
| 라우트 18개의 13줄 껍데기 | 페이지별 PR에서 순차 교체(한 PR에 몰아넣지 않는다) |
| `docs/web/ui-plan.md`·`docs/web/ui/*.md` | **대체됨** 표시를 달고 유지(배치 근거의 역사 기록) |
| `docs/web/pages/*.md` | 유지. 이 계획의 페이지 문서가 상호작용 요약을 추가 |

## 6. 리스크와 대응

| # | 리스크 | 영향 | 대응 |
| --- | --- | --- | --- |
| R1 | STDF에 포커스 트랩·탭 의미가 없어 직접 구현해야 한다 | 대화상자 품질이 구현 품질에 좌우 | `TaskDialog` 한 곳에 격리, PR P1-3에서 키보드 시나리오 테스트 |
| R2 | STDF 버전 업으로 클래스·props가 바뀔 수 있다(`^3.0.0`) | 셸 깨짐 | `stdf`를 **정확한 버전으로 고정**(`"3.0.0"`)하고 업그레이드 시 본 문서 §1.1 재검증 |
| R3 | 목 계약과 실제 DB 계약이 어긋난다 | P8에서 대규모 수정 | `types.ts`를 스키마 enum과 1:1로 유지, 목 표본 검증 테스트 추가 |
| R4 | 경매 규칙·권한 정책이 미확정 | P5 화면 재작업 | UI는 `capabilities`·상태만 소비, 규칙은 서버 응답으로 분리 |
| R5 | 디자인이 다시 "문서만 있는 상태"로 돌아간다 | 목표 미달 | 단계별 화면 완료 판정([pages.md 부록 B](pages.md#부록-b-화면-완성-판정-dod))을 PR 체크리스트로 강제 |
| R6 | 한글 폰트 용량으로 첫 화면 지연 | LCP 초과 | 서브셋·preload·폴백 메트릭, P7에서 실측 |
| R7 | 과도한 카드·배지로 다시 복잡해진다 | MSM1 회귀 | 카드 상한(화면당 3~6), 상태 태그 1축 1개, 체크리스트 유지 |

## 7. 완료 정의 (전체)

1. 18개 라우트가 모두 **실제 화면**이고, 각 화면에 주 행동 또는 실제 데이터 링크가 있다.
2. 위 6개 검증 게이트를 모두 통과한다.
3. `/dev/components`에서 모든 컴포넌트의 5상태를 재현할 수 있다.
4. 디자인 문서(이 디렉터리)와 코드가 일치한다. 문서에만 있는 컴포넌트가 없다.
5. 기존 서버 로직 테스트(`apps/web/tests`)가 그대로 통과한다.
6. `docs/changelog.md`에 단계별 개선 기록이 있다.

## 8. 이후(P8) 연결 순서

| 순서 | 작업 | 프론트 변경 |
| --- | --- | --- |
| 1 | 세션·viewer·서버 목록을 `+layout.server.ts`에서 제공 | `$lib/data` 어댑터 교체만 |
| 2 | 내전·경기 조회 API | 목 어댑터 → 서버 어댑터 |
| 3 | 참가 신청·선발 mutation | `RegistrationDialog`·`OperationsPanel`의 제출 핸들러만 교체 |
| 4 | 편성·경매·대진 mutation(리비전 충돌) | 초안→커밋 계약을 그대로 두고 409 처리 추가 |
| 5 | ROFL 업로드 | `RoflUploadDialog`의 제출을 `fetch`로 교체, 작업 상태 조회 연결 |
| 6 | 실시간 갱신(필요 시) | `AsyncSection` 재조회 훅만 추가(화면 구조 유지) |

프론트 화면은 P8에서 **구조를 바꾸지 않는다**. 이것을 보장하기 위해 데이터 경계를 `$lib/data` 한 곳에 두었다.
