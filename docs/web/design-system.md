# 디자인 시스템: 소환사의 협곡 전술 상황판

갱신일: 2026-11-17. `apps/web/src/routes/layout.css`와 `apps/web/src/lib/components/common/`의 네이티브 프리미티브를 기준으로 한다. UI 컴포넌트 라이브러리는 쓰지 않는다.

## 1. 원칙

- 화면은 네이티브 HTML 요소와 Tailwind CSS로 만든다. 버튼은 `<button>`, 링크는 `<a>`, 대화상자는 `<dialog>`, 메뉴는 절대 위치 패널로 구현한다.
- 서비스 공통 프리미티브는 `apps/web/src/lib/components/common/`에 한 번만 만들고 재사용한다.
- 색·글꼴·모서리·간격은 `layout.css`의 `@theme` 토큰만 쓴다.
- 상태는 색과 문구를 함께 쓴다. 색만으로 의미를 전달하지 않는다.
- 같은 기능의 조작은 한 화면에서 한 번만 제공하고, 같은 설명은 필요한 한 곳에만 쓴다.

## 2. 방향과 장면

채택 방향은 **소환사의 협곡 전술 상황판**이다. 저녁, 어두운 방에서 Discord와 리그 오브 레전드 클라이언트를 함께 켜 둔 운영자의 듀얼 모니터를 기준으로 한다. 왼쪽 전술 레일이 서버·메뉴를 고정하고, 작업 영역은 전장 슬레이트 바탕 위 우상단에서 옅게 번지는 넥서스 시안을 받는다. 라이트 모드는 같은 구조를 전장 석회암·남청 잉크·짙은 청록으로 옮긴다.

- 워드마크: `Oxanium` 700 (`font-brand`).
- 본문·메뉴·컨트롤: `Noto Sans KR` 400/500/600/700.
- 숫자는 기본 `font-variant-numeric: tabular-nums`.
- 현재 단계와 다음 행동만 시안. 나머지는 전장 잉크와 1px 괘선으로 물러난다.

## 3. 토큰

| 분류 | 토큰 | 사용 |
| --- | --- | --- |
| 바탕 | `--color-bg-base(-dark)` | 페이지 바탕 |
| 표면 | `--color-bg-surface(-dark)`, `--color-bg-overlay(-dark)`, `--color-bg-highlight(-dark)` | 카드·표 머리·호버·현재 칸 |
| 잉크 | `--color-text-primary`, `--color-text-dark`, `--color-text-muted` | 본문과 보조 정보 |
| 강조 | `--color-hex`, `--color-hex-hover`, `--color-hex-ink` | 현재 단계·선택·주요 행동 |
| 괘선 | `--color-border`, `--color-border-strong`, `--color-brass-line` | 1px 구분선 |
| 포지션 | `--color-role-gold`, `--color-role-dim` | Riot 포지션 심볼 |
| 상태 | `--color-success`, `--color-warning`, `--color-error`, `--color-info` | 선발·대기·진행·오류 |
| 진영 | `--color-team-blue`, `--color-team-red` | 블루/레드 팀 |
| 순위 | `--color-medal-gold`, `--color-medal-silver`, `--color-medal-bronze` | 1~3위 |
| 모서리 | `--radius-box`(8px), `--radius-form`(6px), `--radius-small`(4px) | 패널·입력·칩 |
| 글꼴 | `--font-sans`, `--font-brand` | 본문·워드마크 |
| 틀 | `--app-header-height`(54px), `--app-content-width`(84rem) | 모바일 바·본문 폭 |

공용 클래스:

- `.hex-panel`: 1px 괘선과 8px 모서리의 패널.
- `.app-main`: 작업 영역 바탕. 우상단 시안 방사형 그라데이션 + 기본 바탕.
- `.app-frame`: 최대 84rem 본문 폭과 양옆 경계. 레일 레이아웃에서는 쓰지 않는다.
- `.doc`: 이용 안내·약관·개인정보 본문 폭과 행간.

## 4. 컴포넌트 선택표

| 용도 | 컴포넌트 |
| --- | --- |
| 행동 | `common/Button.svelte` — `variant`(primary/secondary/quiet/danger), `size`, `loading`, `disabled`, `href` |
| 텍스트 입력 | `common/TextField.svelte` — `label`, `value`(bindable), `error`, `hint` |
| 날짜 입력 | `common/DateField.svelte` — 표시 `YYYY/MM/DD`, 값 ISO `YYYY-MM-DD`, 실제 달력 검증 |
| 선택 | `common/SelectField.svelte`, `common/RadioGroup.svelte`, `common/CheckboxField.svelte`, `common/SwitchCell.svelte` |
| 대화상자 | `common/Dialog.svelte` — 네이티브 `<dialog>` |
| 메뉴 | `common/PopoverMenu.svelte`, `common/MenuButton.svelte` — 계정 메뉴의 화면 모드 포함 |
| 확인 | `lib/ui/confirm.ts` + `common/ConfirmDialog.svelte` |
| 알림 | `lib/ui/toast.ts` + `common/ToastHost.svelte` |
| 상태 라벨 | `common/StatusTag.svelte` |
| 포지션 | `common/PositionChips.svelte` (`static/riot/positions/*.svg`) |
| 포지션 분포 | `scrims/LaneMatrix.svelte` |
| 목록 상태 | `common/SectionState.svelte`, `common/Skeleton.svelte`, `common/Spinner.svelte` |
| 쪽 이동 | `common/PageNav.svelte` |
| 시즌 선택 | `common/SeasonSelector.svelte` |
| 필터 탭 | `common/SelectionTabs.svelte` |
| 아바타 묶음 | `common/AvatarStack.svelte` |

## 5. 셸과 내비게이션

- 데스크톱은 224px 왼쪽 전술 레일이다. 로고·Oxanium 워드마크·서버 선택·서버 메뉴 5종을 위에서, 계정을 아래에서 고정한다.
- 현재 서버 메뉴는 시안 틴트와 시안 글자. 같은 목적지를 본문 메뉴에 중복하지 않는다.
- 모바일은 54px 상단 바 + 오른쪽 메뉴 시트다. 데스크톱 레일과 동시에 렌더링하지 않는다.
- 화면 모드 전환은 하단 계정 메뉴 안에만 둔다. 별도 상단·레일 스위치를 두지 않는다.
- 작업 영역은 레일과 24px 안쪽 여백으로 맞닿고, 우상단 시안 틴트를 받는다.
- `AppFooter`는 작업 영역 열 안에서 같은 폭과 여백을 쓴다.

## 6. 테마 전환

`lib/ui/theme.ts`가 `html[data-mode]`와 `localStorage['theme-mode']`만 다룬다. `primary`가 라이트, `dark`가 다크다. `app.html`의 첫 페인트 스크립트가 저장값을 복원한다. `[data-mode='dark']`가 다크 토큰을 덮어쓰고 `dark:` 변형도 같은 선택자를 쓴다.

## 7. 작성 규칙

- 채움 컨트롤은 6px 모서리와 `bg-hex text-hex-ink`. 모따기(clip-path)와 하드 오프셋 그림자를 쓰지 않는다.
- 제목 위에 작은 kicker/eyebrow를 두지 않는다.
- 좌/우에 3px 색 띠를 두지 않는다. 강조는 배경 틴트·1px 괘선·상태 문구로 한다.
- 이모지나 유니코드 문자를 아이콘 대용으로 쓰지 않는다.
- 본문과 입력 글자는 배경 대비 4.5:1 이상, 큰 글자와 컨트롤 경계는 3:1 이상을 유지한다.
- 한국어는 `word-break: keep-all`과 `overflow-wrap: anywhere`로 어절 단위 줄바꿈을 유지한다.

## 8. 확인

- `pnpm check` (Prettier·브랜딩·svelte-check).
- `pnpm --filter @msm2/web dev` 후 내전 상세를 1440px·1024px·390px, 라이트·다크로 확인한다.
- `impeccable detect --json <변경 파일>`로 대비·간격·금지 패턴을 확인한다.
