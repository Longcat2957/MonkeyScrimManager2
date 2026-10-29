# 디자인 시스템 — Arena Console

작성일: 2026-10-29. 대상: `apps/web`의 모든 서비스 화면.
선행 문서: [진단서](audit.md) · 다음 문서: [코드 구조](architecture.md) · [컴포넌트](components.md) · [페이지](pages.md)

이 문서는 화면이 공유하는 **시각 언어와 코드 토큰을 확정**한다. 페이지별 배치는 [pages.md](pages.md)가 담당하며,
여기에 없는 색·크기·간격을 화면 코드에서 임의로 만들지 않는다.

## 1. 콘셉트

**Arena Console** — 내전이 진행되는 저녁, 운영자가 한 화면에서 모집·편성·대진·결과를 지휘하는 콘솔.
브랜드(로고)의 세 색을 그대로 시스템의 뼈대로 쓴다.

| 원칙 | 의미 | 코드로의 규칙 |
| --- | --- | --- |
| **신호 우선** | 지금 무엇을 해야 하는가가 가장 먼저 보인다 | 화면당 주 행동 1개(`accent` CTA), 상태는 텍스트+톤, 장식은 최소 |
| **숫자가 주인공** | 점수·인원·포인트·승률이 이 서비스의 언어다 | 모든 수치는 `tabular-nums`, 디스플레이 숫자는 Jersey 10 |
| **어두운 무대** | 경기 기록·대진은 스크린에서 읽는다 | 다크를 기본 시각 기준으로 설계, 라이트도 동등하게 완성 |
| **선은 얇게, 면은 겹겹이** | 카드 남발 대신 계층으로 구분 | 그림자 대신 1px 헤어라인 + 표면 단계 |
| **같은 일은 같은 모양** | 모집·편성·대진이 화면마다 달라 보이지 않는다 | 상태 태그·인원 미터·선수 행은 공용 컴포넌트만 |

### 시그니처 요소 (다른 사이트와 구분되는 5가지)

1. **시안 액션**: 주 행동은 시안 채움 + 잉크 글자. 화면에 하나만 존재한다.
2. **사이드 레일**: 팀 A/블루는 좌측 파랑 레일, 팀 B/레드는 좌측 빨강 레일. 색만으로 구분하지 않고 `블루`·`레드` 라벨을 병기한다.
3. **인원 미터**: 참가 정원을 1px 트랙 + 시안 채움으로 표시. 숫자는 `12/20`.
4. **저지 숫자**: 시리즈 점수·라운드 번호는 Jersey 10 대형 숫자. 본문 숫자는 Noto Sans KR tabular.
5. **지금 줄**: 모든 운영 화면 상단에 "지금 할 일" 한 줄(상태 + 다음 행동). 요약 카드를 반복하지 않는다.

## 2. 색

### 2.1. 원색 (브랜드에서 추출)

로고 `static/brand/logo.png`의 픽셀에서 확인한 값이다: 잉크 `#030A17`, 크림 `#F6F1E8`, 눈 시안 `#09E5F9`.

| 토큰 | 값 | 용도 |
| --- | --- | --- |
| `--color-ink-950` | `#050A15` | 다크 최저면·CTA 글자 |
| `--color-ink-900` | `#0B1322` | 다크 표면 |
| `--color-ink-850` | `#101A2C` | 다크 상승면 |
| `--color-ink-800` | `#16223A` | 다크 오버레이·구분면 |
| `--color-ink-700` | `#22314C` | 다크 강한 경계 |
| `--color-ink-600` | `#34445F` | 다크 경계 |
| `--color-ink-500` | `#4C5D78` | 다크 희미 경계 |
| `--color-cream-50` | `#F7F3EC` | 라이트 바탕 |
| `--color-cream-100` | `#F1EBDF` | 라이트 구분면 |
| `--color-cream-200` | `#E6DCCB` | 라이트 경계 |
| `--color-cream-300` | `#D6C9B4` | 라이트 강한 경계 |
| `--color-signal-300` | `#5EE7F6` | 다크 링크·호버 |
| `--color-signal-400` | `#2ADCF0` | 다크 액션 채움(STDF `dark`), 포커스 링 |
| `--color-signal-500` | `#09E5F9` | 라이트 액션 채움(STDF `primary`) |
| `--color-signal-600` | `#00B4C8` | 장식·게이지 |
| `--color-signal-700` | `#0A6B7A` | 라이트 링크·강조 글자(대비 5.59:1) |
| `--color-signal-800` | `#075763` | 라이트 강조 글자(대비 7.44:1) |

### 2.2. 의미 토큰 (테마별로 값이 바뀐다)

컴포넌트는 원색이 아니라 아래 의미 토큰을 사용한다. 모드 전환은 `html[data-mode]` 한 곳에서만 일어난다.

| 의미 토큰 | 라이트 | 다크 | 용도 |
| --- | --- | --- | --- |
| `--surface-app` | `#F7F3EC` | `#060B16` | 페이지 바탕 |
| `--surface-card` | `#FFFFFF` | `#0B1322` | 업무 단위 표면 |
| `--surface-sunken` | `#F1EBDF` | `#050A15` | 표 머리·입력 바탕 |
| `--surface-raised` | `#FFFFFF` | `#101A2C` | 호버·선택된 행 |
| `--surface-overlay` | `#FFFFFF` | `#16223A` | 팝업·시트 |
| `--line` | `#E6DCCB` | `#22314C` | 기본 헤어라인 |
| `--line-strong` | `#D6C9B4` | `#34445F` | 표 머리·구분 강조 |
| `--text` | `#0B1322` | `#E9EDF5` | 본문·제목 |
| `--text-muted` | `#55617A` | `#9AA7BD` | 보조 설명 |
| `--text-faint` | `#7B8699` | `#7483A0` | 비활성·메타 |
| `--action-bg` | `#09E5F9` | `#2ADCF0` | 주 행동 채움 |
| `--action-fg` | `#04121C` | `#04121C` | 주 행동 글자 |
| `--focus-ring` | `#0A6B7A` | `#2ADCF0` | 가시 포커스 |
| `--side-a` | `#1D4ED8` | `#7FA7FF` | 팀 A·블루 레일·텍스트 |
| `--side-b` | `#C0273B` | `#FF8A97` | 팀 B·레드 레일·텍스트 |
| `--success` | `#177A55` | `#3BD08B` | 승리·완료·유효 |
| `--warning` | `#8A5A06` | `#F0B04A` | 대기·주의·미확정 |
| `--danger` | `#B32638` | `#FF7A88` | 패배·실패·취소 |
| `--info` | `#0A6B7A` | `#2ADCF0` | 안내 |

모든 대비는 WCAG AA(본문 4.5:1, 큰 글자 3:1) 이상을 확인했다. 계산 근거: `--side-a` 라이트 6.06, `--side-b` 라이트 5.28,
`--success` 라이트 4.80, `--text-muted` 라이트 5.62·다크 7.64, 액션 채움 위 잉크 글자 12.26.
**색은 보조 신호다.** 승패·진행은 반드시 `승리`·`패배`·`모집 중` 같은 텍스트 라벨과 함께 표시한다.

### 2.3. STDF 테마 연결 (확인된 계약)

STDF 컴포넌트의 색은 `@theme`의 고정 변수를 읽는다. 설치판 소스에서 확인한 사실:

- `Button fill="base" state="theme"` → `bg-primary dark:bg-dark`, 글자 `text-on-primary dark:text-text-on-dark`
  (`@any-tdf/common/dist/derived/button.js`).
- 즉 **`--color-dark`는 다크 배경이 아니라 "다크 모드의 강조색"**이다. 이 값을 잉크로 두면 다크 모드 버튼이 사라진다.
  현재 테마가 `--color-dark`를 연한 회색으로 둔 것도 이 계약을 오해한 결과다.
- 표면은 `--color-bg-*-dark`, 경계·본문은 `--color-text-dark`가 담당한다.

따라서 STDF 계약에 다음과 같이 매핑한다.

| STDF 변수 | 라이트(= `primary` 계열) | 다크(= `dark` 계열) |
| --- | --- | --- |
| `--color-primary` / `--color-dark` | `#09E5F9`(시안 500) | `#2ADCF0`(시안 400) |
| `--color-text-on-primary` / `--color-text-on-dark` | `#04121C` | `#04121C` |
| `--color-bg-base` / `--color-bg-base-dark` | `#F7F3EC` | `#060B16` |
| `--color-bg-surface` / `--color-bg-surface-dark` | `#FFFFFF` | `#0B1322` |
| `--color-bg-overlay` / `--color-bg-overlay-dark` | `#FFFFFF` | `#16223A` |
| `--color-bg-highlight` / `--color-bg-highlight-dark` | `#F1EBDF` | `#101A2C` |
| `--color-text-primary` / `--color-text-dark` | `#0B1322` | `#E9EDF5` |
| `--color-success` / `--color-warning` / `--color-error` / `--color-info` | 2.2 표의 라이트 값 | 2.2 표의 다크 값 |

STDF 컴포넌트(`Button state="error"`, `Progress`, `Loading` 등)가 자동으로 위 색을 따른다. 색을 다시 지정하지 않는다.

## 3. 타이포그래피

| 역할 | 폰트 | 크기/행간 | 굵기 | 사용처 |
| --- | --- | --- | --- | --- |
| `display-xl` | Jersey 10 | 56/0.95 | 400 | 시리즈 점수, 랜딩 헤드라인 |
| `display-l` | Jersey 10 | 40/1.0 | 400 | 라운드 번호, 경매 낙찰가 |
| `title-xl` | Noto Sans KR | 24/1.35 | 700 | 페이지 제목 |
| `title-l` | Noto Sans KR | 20/1.4 | 700 | 영역 제목 |
| `title-m` | Noto Sans KR | 16/1.45 | 700 | 카드·행 제목 |
| `body` | Noto Sans KR | 15/1.65 | 400 | 본문·설명 |
| `body-s` | Noto Sans KR | 14/1.55 | 400 | 표 셀, 보조 문장 |
| `caption` | Noto Sans KR | 12.5/1.4 | 500 | 메타·라벨, `letter-spacing: 0.02em` |
| `numeric` | Noto Sans KR | 상속 | 500~700 | `font-variant-numeric: tabular-nums` |

규칙:

- Jersey 10은 **워드마크, 점수, 라운드, 포인트 금액**에만 쓴다. 문장·라벨·버튼에는 절대 쓰지 않는다.
- 한국어 본문은 15px 미만으로 내리지 않는다(표 셀 14px 허용). `text-balance`는 제목에만, `text-pretty`는 리드 문단에만.
- 숫자와 단위 사이에는 좁은 공백(`&thinsp;`)을 쓴다: `1&thinsp;500`. 퍼센트는 붙여 쓴다: `62%`.
- 읽기 폭: 문서 42rem(≈ 68ch), 폼 44rem, 표·보드는 폭 전체.

## 4. 간격·레이아웃·형태

| 항목 | 값 |
| --- | --- |
| 기본 단위 | 4px (Tailwind 기본 스케일 사용, 임의 값 금지) |
| 페이지 거터 | 16px(≤639) → 24px(640~1023) → 32px(≥1024) |
| 셸 최대 폭 | 88rem (헤더·푸터·본문 공통) |
| 보드 최대 폭 | 76rem |
| 읽기 폭 | 42rem |
| 영역 간격 | 24px, 큰 블록 사이 32~40px |
| 헤더 높이 | 56px(모바일) / 64px(데스크톱) |
| 컨텍스트 레일 | 44px(모바일 전용, 헤더 아래 붙음) |
| 행 높이 | 표 44px, 목록 56px, 모바일 터치 대상 최소 44px |
| 반경 | `--radius-small: 0.25rem`, `--radius-form: 0.5rem`, `--radius-box: 0.75rem`, `--radius-pill: 999px` |
| 경계 | 기본 1px `--line`, 강조 `--line-strong`. 그림자는 오버레이에만 |
| 그림자 | `--shadow-overlay: 0 24px 60px -20px rgb(3 10 23 / 0.45)` |

**카드 사용 규칙**: 카드는 *편집·판단 단위*(팀, 경매 후보, 경기)에만 쓴다. 목록 항목·지표·설명은 카드가 아니라
제목+구분선+정렬된 숫자로 처리한다. 화면당 카드 밀도는 3~6개를 상한으로 권장한다.

브레이크포인트: `sm 40rem / md 48rem / lg 64rem / xl 80rem / 2xl 96rem`.
데스크톱·모바일 두 조작을 동시에 두지 않는다. **같은 DOM을 재배치**하고, 패널만 반응형으로 교체한다.

## 5. 모션

| 토큰 | 값 | 용도 |
| --- | --- | --- |
| `--motion-fast` | 120ms | 호버·포커스·태그 |
| `--motion-base` | 180ms | 패널·아코디언 |
| `--motion-slow` | 320ms | 시트·페이지 전환 |
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | 진입 |
| `--ease-in-out` | `cubic-bezier(0.4, 0, 0.2, 1)` | 상태 전환 |

`prefers-reduced-motion: reduce`에서 모든 transform/transition을 끈다(색 전환은 유지).
반짝이는 효과·카운트다운 연출·자동 재생은 넣지 않는다. 경매 후보 변경처럼 **변화가 결과에 영향을 주는 지점**만
`prefers-reduced-motion`에서도 즉시 갱신한다.

## 6. 상태의 시각 문법

상태는 `StatusTag`(native `<span>` + 의미 토큰) 하나로 표현한다. STDF `Tag`는 `role="button"` + `tabindex=0`으로
렌더되어(`tag/Tag.svelte:54-59`) 표시용 라벨에 쓰면 행마다 포커스 정류장이 생기므로 **사용자가 누르거나 닫는 칩에만** 쓴다.

| 상태 계열 | 톤 토큰 | 라벨 예 |
| --- | --- | --- |
| 정상 진행 | `--info` | `모집 중`, `입찰 진행`, `진행 중` |
| 완료·성공 | `--success` | `승리`, `편성 완료`, `기록됨` |
| 대기·미확정 | `--warning` | `대기`, `결과 대기`, `미정` |
| 실패·취소·패배 | `--danger` | `패배`, `취소`, `중도 종료` |
| 중립 정보 | `--text-muted` | `엔트리 편성`, `BO5`, `10인` |

- 같은 화면에서 같은 상태는 항상 같은 톤·같은 문구를 쓴다(용어집은 [pages.md 부록 A](pages.md#부록-a-용어와-상태-문구)).
- 상태 태그는 한 축에 하나만 표시한다. 상태 + 다음 행동은 "지금 줄"에서 한 번만 안내한다.

## 7. 아이콘

- 24px 그리드, `stroke-width: 1.75`, `stroke: currentColor`, 기본 `aria-hidden="true"`.
- STDF의 내장 글리프(닫기·체크·화살표·더보기)는 STDF 컴포넌트가 그리는 그대로 사용한다.
- 도메인 글리프(사용자·깃발·트로피·타이머·포인트 등)는 **`ServiceIcon.svelte` 한 파일의 레지스트리**로만 추가한다.
  페이지마다 인라인 SVG를 쓰지 않는다. 아이콘 라이브러리 의존성은 추가하지 않는다.
- 아이콘 단독 버튼은 `aria-label`을 갖는다. 아이콘+텍스트 버튼은 아이콘을 `aria-hidden`으로 둔다.

## 8. 코드: 토큰과 기저 스타일

`apps/web/src/lib/styles/` 아래 3개 파일로 나눈다. `routes/layout.css`는 진입점만 담당한다.

```css
/* apps/web/src/routes/layout.css — 진입점 */
@import 'tailwindcss';
@import 'stdf/source.css';
@import '../lib/styles/tokens.css';
@import '../lib/styles/base.css';
@import '../lib/styles/utilities.css';
```

### 8.1. `tokens.css`

```css
/* STDF가 읽는 고정 변수와 서비스 의미 토큰을 한 곳에서 정의한다. */

/* 다크 변형은 html[data-mode] 하나로만 판정한다. */
@custom-variant dark (&:where([data-mode='dark'], [data-mode='dark'] *));

@theme {
	--font-sans:
		'Noto Sans KR', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
	--font-brand: 'Jersey 10', 'Noto Sans KR', sans-serif;
	--font-mono: ui-monospace, 'SFMono-Regular', 'Menlo', monospace;

	/* 브랜드 원색 */
	--color-ink-950: #050a15;
	--color-ink-900: #0b1322;
	--color-ink-850: #101a2c;
	--color-ink-800: #16223a;
	--color-ink-700: #22314c;
	--color-ink-600: #34445f;
	--color-ink-500: #4c5d78;
	--color-cream-50: #f7f3ec;
	--color-cream-100: #f1ebdf;
	--color-cream-200: #e6dccb;
	--color-cream-300: #d6c9b4;
	--color-signal-300: #5ee7f6;
	--color-signal-400: #2adcf0;
	--color-signal-500: #09e5f9;
	--color-signal-600: #00b4c8;
	--color-signal-700: #0a6b7a;
	--color-signal-800: #075763;

	/* STDF 계약: primary = 라이트 강조, dark = 다크 강조 */
	--color-primary: #09e5f9;
	--color-text-on-primary: #04121c;
	--color-dark: #2adcf0;
	--color-text-on-dark: #04121c;
	--color-bg-base: #f7f3ec;
	--color-bg-surface: #ffffff;
	--color-bg-overlay: #ffffff;
	--color-bg-highlight: #f1ebdf;
	--color-bg-base-dark: #060b16;
	--color-bg-surface-dark: #0b1322;
	--color-bg-overlay-dark: #16223a;
	--color-bg-highlight-dark: #101a2c;
	--color-text-primary: #0b1322;
	--color-text-dark: #e9edf5;
	--color-success: #177a55;
	--color-warning: #8a5a06;
	--color-error: #b32638;
	--color-info: #0a6b7a;

	--radius-small: 0.25rem;
	--radius-form: 0.5rem;
	--radius-box: 0.75rem;
}

@theme inline {
	/* 의미 토큰: bg-surface-card, text-muted 처럼 유틸리티로 바로 쓴다. */
	--color-surface-app: var(--surface-app);
	--color-surface-card: var(--surface-card);
	--color-surface-sunken: var(--surface-sunken);
	--color-surface-raised: var(--surface-raised);
	--color-surface-overlay: var(--surface-overlay);
	--color-line: var(--line);
	--color-line-strong: var(--line-strong);
	--color-fg: var(--text);
	--color-muted: var(--text-muted);
	--color-faint: var(--text-faint);
	--color-action: var(--action-bg);
	--color-action-fg: var(--action-fg);
	--color-side-a: var(--side-a);
	--color-side-b: var(--side-b);
	--color-tone-success: var(--success);
	--color-tone-warning: var(--warning);
	--color-tone-danger: var(--danger);
	--color-tone-info: var(--info);
}

:root {
	--surface-app: #f7f3ec;
	--surface-card: #ffffff;
	--surface-sunken: #f1ebdf;
	--surface-raised: #ffffff;
	--surface-overlay: #ffffff;
	--line: #e6dccb;
	--line-strong: #d6c9b4;
	--text: #0b1322;
	--text-muted: #55617a;
	--text-faint: #7b8699;
	--action-bg: #09e5f9;
	--action-fg: #04121c;
	--focus-ring: #0a6b7a;
	--side-a: #1d4ed8;
	--side-b: #c0273b;
	--success: #177a55;
	--warning: #8a5a06;
	--danger: #b32638;
	--info: #0a6b7a;
	--shadow-overlay: 0 24px 60px -20px rgb(3 10 23 / 0.35);
	--motion-fast: 120ms;
	--motion-base: 180ms;
	--motion-slow: 320ms;
	--ease-out: cubic-bezier(0.16, 1, 0.3, 1);
	--app-header-height: 3.5rem;
	--app-rail-height: 2.75rem;
}

html[data-mode='dark'] {
	--surface-app: #060b16;
	--surface-card: #0b1322;
	--surface-sunken: #050a15;
	--surface-raised: #101a2c;
	--surface-overlay: #16223a;
	--line: #22314c;
	--line-strong: #34445f;
	--text: #e9edf5;
	--text-muted: #9aa7bd;
	--text-faint: #7483a0;
	--action-bg: #2adcf0;
	--action-fg: #04121c;
	--focus-ring: #2adcf0;
	--side-a: #7fa7ff;
	--side-b: #ff8a97;
	--success: #3bd08b;
	--warning: #f0b04a;
	--danger: #ff7a88;
	--info: #2adcf0;
	--shadow-overlay: 0 24px 60px -20px rgb(0 0 0 / 0.6);
	--app-header-height: 4rem;
	color-scheme: dark;
}

@media (min-width: 64rem) {
	:root {
		--app-header-height: 4rem;
	}
}
```

### 8.2. `base.css`

```css
@layer base {
	html {
		font-family: var(--font-sans);
		color-scheme: light;
		scroll-padding-top: calc(var(--app-header-height) + var(--app-rail-height) + 1rem);
		-webkit-text-size-adjust: 100%;
		@apply bg-surface-app text-fg;
	}

	body {
		min-height: 100dvh;
		/* 100dvh를 지원하지 않는 환경에서도 하단 여백을 유지한다. */
		min-height: 100vh;
	}

	:where(h1, h2, h3, h4) {
		text-wrap: balance;
	}

	p {
		text-wrap: pretty;
	}

	:where(a) {
		color: inherit;
		text-underline-offset: 0.25em;
	}

	/* 포커스는 항상 보인다. outline-offset을 유지해 표에서 잘리지 않게 한다. */
	:where(a, button, summary, input, select, textarea, [tabindex]):focus-visible {
		outline: 2px solid var(--focus-ring);
		outline-offset: 2px;
		border-radius: var(--radius-small);
	}

	::selection {
		background: color-mix(in oklab, var(--action-bg) 45%, transparent);
		color: inherit;
	}

	@media (prefers-reduced-motion: reduce) {
		*,
		*::before,
		*::after {
			animation-duration: 0.01ms !important;
			animation-iteration-count: 1 !important;
			transition-duration: 0.01ms !important;
			scroll-behavior: auto !important;
		}
	}
}
```

### 8.3. `utilities.css`

```css
@layer components {
	/* 셸 폭: 헤더·본문·푸터가 같은 좌우 기준선을 공유한다. */
	.shell {
		width: 100%;
		max-width: 88rem;
		margin-inline: auto;
		padding-inline: 1rem;
	}

	@media (min-width: 40rem) {
		.shell {
			padding-inline: 1.5rem;
		}
	}

	@media (min-width: 64rem) {
		.shell {
			padding-inline: 2rem;
		}
	}

	.board {
		max-width: 76rem;
	}

	.measure {
		max-width: 42rem;
	}

	/* 숫자 정렬이 필요한 모든 곳 */
	.tabular {
		font-variant-numeric: tabular-nums;
		font-feature-settings: 'tnum' 1;
	}

	/* 디스플레이 숫자: Jersey 10 숫자 폭 보정 */
	.numeric-display {
		font-family: var(--font-brand);
		font-weight: 400;
		font-synthesis: none;
		letter-spacing: 0.01em;
		line-height: 1;
	}

	.category-label {
		font-size: 0.78125rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-muted);
	}

	/* 헤어라인 구분: 카드 대신 사용 */
	.divide-hairline > * + * {
		border-top: 1px solid var(--line);
	}

	/* 팀 사이드 레일 */
	.rail-a {
		box-shadow: inset 3px 0 0 var(--side-a);
	}

	.rail-b {
		box-shadow: inset 3px 0 0 var(--side-b);
	}
}
```

## 9. 폰트 로딩

현재는 Google Fonts 외부 CSS를 렌더 차단으로 불러온다(`app.html:18-23`). 다음으로 바꾼다.

1. **자체 호스팅**: `@fontsource-variable/noto-sans-kr`(가변) 또는 서브셋 woff2 2~3개를 `static/fonts/`에 둔다.
   사용 가능 여부를 설치 단계에서 확인하고, 둘 다 불가하면 현재 외부 로드를 유지하되 `preload`를 붙인다.
2. Jersey 10은 숫자·워드마크에만 쓰므로 `font-display: swap` + `size-adjust` 폴백을 정의해 CLS를 막는다.
3. Noto Sans KR은 `font-display: swap`, 본문 첫 화면은 시스템 폰트 폴백 메트릭(`ascent-override` 등)으로 흔들림을 최소화한다.
4. `<link rel="preload" as="font" type="font/woff2" crossorigin>` 는 실제 사용하는 1~2개 파일에만 건다.
5. 예산: 폰트 전송량 400KB 이하, 첫 화면 폰트 요청 3개 이하.

```html
<!-- apps/web/src/app.html — 바뀌는 부분 -->
<html lang="ko">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
		<meta name="color-scheme" content="light dark" />
		<meta name="theme-color" content="#060B16" media="(prefers-color-scheme: dark)" />
		<meta name="theme-color" content="#F7F3EC" media="(prefers-color-scheme: light)" />
		<script>
			// 첫 페인트 전에 저장된 모드 또는 시스템 설정을 적용한다.
			(() => {
				const saved = (() => {
					try {
						return localStorage.getItem('msm2-mode');
					} catch {
						return null;
					}
				})();
				const system = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
				document.documentElement.dataset.mode = saved === 'dark' || saved === 'light' ? saved : system;
			})();
		</script>
		<!-- 자체 호스팅 폰트: 실제로 쓰는 woff2만 preload (외부 Google Fonts는 제거) -->
		<link rel="preload" href="%sveltekit.assets%/fonts/noto-sans-kr-var.woff2" as="font" type="font/woff2" crossorigin />
		<link rel="preload" href="%sveltekit.assets%/fonts/jersey-10.woff2" as="font" type="font/woff2" crossorigin />
		<link rel="icon" type="image/png" sizes="128x128" href="%sveltekit.assets%/brand/favicon.png" />
		%sveltekit.head%
	</head>
	<body data-sveltekit-preload-data="hover">
		<div style="display: contents">%sveltekit.body%</div>
	</body>
</html>
```

- 저장 키는 `msm2-mode`(`light` | `dark`). `primary`/`dark` 혼용을 없앤다.
- `app.html`에서 `data-mode`를 인라인으로 결정하므로 하이드레이션 전 깜빡임이 없다.
- `ConfigProvider`(`stdf/lang`의 `ko_KR`)는 루트 레이아웃에서 한 번만 감싼다. 컴포넌트마다 언어를 지정하지 않는다.

## 10. 지켜야 할 경계

| 하지 않는다 | 대신 |
| --- | --- |
| 화면 코드에 hex 색·px 크기 직타 | 의미 토큰·`@theme` 스케일 |
| 모든 정보를 카드로 감싸기 | 제목·구분선·정렬된 표 |
| 장식용 그라디언트·글로우·유리 효과 | 잉크 표면 단계 + 시안 1포인트 |
| 페이지마다 다른 버튼 모양 | STDF `Button` + 3종 변형(`accent`/`outline`/`ghost`)만 |
| 아이콘 단독 장식 | 텍스트 라벨 우선, 아이콘은 보조 |
| 모바일용·데스크톱용 두 벌의 마크업 | 같은 마크업 + 재배치 |

## 11. 계획 검토 체크리스트

- [ ] 새 화면에 임의 색·임의 폰트 크기·임의 간격이 0개인가.
- [ ] 주 행동이 화면당 1개이고 시안 채움인가.
- [ ] 수치가 모두 tabular인가.
- [ ] 라이트·다크 양쪽에서 대비가 AA 이상인가.
- [ ] 320px·768px·1280px에서 가로 스크롤이 생기지 않는가(표 컨테이너 제외).
- [ ] 키보드만으로 모든 조작이 가능하고 포커스가 보이는가.
- [ ] `prefers-reduced-motion`에서도 상태 변화가 전달되는가.
