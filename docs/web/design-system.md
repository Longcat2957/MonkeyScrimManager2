# 디자인 시스템: 소환사의 협곡 전술 상황판

색·서체·밀도의 기준은 [Rift 원본 목업](../../apps/web/.impeccable/mocks/decision/rift-tactical.html)과 [DESIGN.md](../../apps/web/DESIGN.md)다. 구현에는 Svelte, 네이티브 HTML, Tailwind와 [공용 CSS](../../apps/web/src/routes/layout.css)를 사용한다.

## 색과 표면

| 역할 | 사용할 토큰·클래스 |
| --- | --- |
| 작업 영역·레일·패널 | `ground`, `rail`, `surface`, `surface-2`; 패널은 `.panel`, 제목과 조작은 `.panel-bar` |
| 본문·보조 글자·구분선 | `ink`, `ink-2`, `muted`, `line`, `line-strong` |
| 주요 행동·현재 항목 | `nexus`, `nexus-ink`, `selected`; 호버는 `nexus-hover` 또는 `surface-hover` |
| 상태와 게임 정보 | `success`, `warning`, `error`, `info`는 상태 문구와 함께 사용. `team-blue/red`, `role-gold`, `medal-*`은 진영·포지션·순위 전용 |
| 표·문서 | `.data-table`은 명부·전적의 열 비교, `.doc`은 장문 안내 |

서비스 이름은 `SERVICE_NAME`, 워드마크는 `font-brand`를 사용한다. 본문·메뉴는 Noto Sans KR이며 숫자의 자릿수 폭은 고정한다. 두 테마는 같은 의미의 토큰을 공유한다. [theme.ts](../../apps/web/src/lib/ui/theme.ts)가 `html[data-mode]`와 `theme-mode` 저장값을 맞춘다. [app.html](../../apps/web/src/app.html)은 다크를 기본으로 쓰고 저장된 선택을 첫 페인트 전에 복원한다.

## 컴포넌트 선택표

별도 UI 라이브러리나 두 번째 컴포넌트 세트를 추가하지 않는다. 아래 이름은 [공통 컴포넌트](../../apps/web/src/lib/components/common/) 기준이다.

| 용도 | 선택 |
| --- | --- |
| 실행·이동 | `Button`의 `primary`, `secondary`, `quiet`, `danger`. 이동에는 실제 링크를 사용 |
| 입력 | `TextField`, `DateField`, `SelectField`, `RadioGroup`, `CheckboxField`, `SwitchCell` |
| 메뉴·대화상자 | `PopoverMenu`, `Dialog`. 확인은 `confirm`과 `ConfirmDialog`, 알림은 `toast`와 `ToastHost` |
| 상태·목록 | `StatusTag`, `SectionState`, `Skeleton`, `Spinner`, `LinkCell` |
| 목록 조작 | `SelectionTabs`, `SeasonSelector`, `PageNav` |
| 사용자·포지션 | `PlayerFace`, `PlayerName`, `AvatarStack`, `PositionIcon`. 내전의 포지션 칩·분포는 [scrims](../../apps/web/src/lib/components/scrims/)의 `PositionChips`, `LaneMatrix` |

셸과 메뉴의 접근 조건은 [라우팅](routing.md), 폼·오류·키보드와 완료 기준은 [화면 패턴](patterns.md)을 따른다.
