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

선수를 나타내는 사진은 `PlayerFace`에 Discord 전역 아바타를 전달한다. 공개 프로필에 커스텀 사진이 없으면 Discord 기본 아바타를 사용한다. 비공개·탈퇴·삭제 사용자에게는 사진 URL을 전달하지 않으며, 이미지 로드에 실패하면 표시 이름의 첫 글자를 사용한다. 챔피언 초상화는 챔피언을 나타낼 때만 사용한다.

## 화면 전환과 상태 변화

- 시안 배경광은 우상단에서 시작해 마우스 방향으로 넓게 이동한다. 가로 이동에 따라 빛이 길고 얇아지며 세로 이동에 따라 기울어진다. 내전 단계 링크는 포인터와 가까운 가장자리에만 짧은 반사광을 표시한다. 현재 단계 밑줄과 키보드 포커스는 별도로 유지하며 터치와 동작 줄이기에서는 두 효과 모두 반응하지 않는다.
- 같은 서버의 메뉴로 이동할 때는 레일·상단 바를 고정한다. 목적 화면이 준비되면 이전 본문은 180ms 동안 사라지고 새 본문은 260ms 동안 나타난다. 메뉴 선택 색도 함께 바뀐다. 이전 화면을 캡처할 수 없는 브라우저에서는 새 본문만 나타낸다.
- 데스크톱 레일을 접으면 메뉴 이름은 90ms 동안 먼저 사라진다. 펼치면 너비 전환(250ms)이 시작된 지 80ms 뒤부터 이름이 150ms 동안 나타난다. 아이콘과 메뉴 행은 그대로 남고, 동작 줄이기 설정에서는 너비와 이름이 즉시 바뀐다.
- 같은 내전의 다른 단계로 이동하면 제목은 유지하고 작업판을 단계 순서에 맞춰 12px, 200ms 이동한다. 한 줄 단계 바에서는 시안 밑줄이 다음 칸으로 이동하고, 두 줄 배치에서는 목적 칸에 바로 표시한다. 뒤로 가기도 같은 기준을 쓴다.
- 첫 방문·새로고침·필터·세트 선택에는 화면 전환을 재생하지 않는다. 동작 줄이기 설정에서는 화면을 즉시 교체하고 상태 문구는 그대로 보여 준다.
- 명부 상태, 낙찰·배치된 선수, 교환한 자리, 등록된 ROFL 세트 번호는 바뀐 곳만 잠깐 강조한다. 수동 편성의 자리 강조는 이동 표시이지 저장 성공 표시가 아니다.

셸과 메뉴의 접근 조건은 [라우팅](routing.md), 폼·오류·키보드와 완료 기준은 [화면 패턴](patterns.md)을 따른다.
