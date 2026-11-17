---
name: Monkeybot
description: 리그 오브 레전드 내전의 단계·참가자·기록을 소환사의 협곡 전술 상황판 문법으로 보여 주는 운영 화면
colors:
  rift-basalt: "#080c12"
  fog-slate: "#0e151f"
  river-stone: "#141e2c"
  ridge-stone: "#192638"
  rift-line: "#1f2e42"
  nexus-cyan: "#00d4ff"
  nexus-cyan-hover: "#33ddff"
  nexus-ink: "#041017"
  chalk: "#eaf2fa"
  fog-muted: "#8ea4be"
  role-gold: "#d4b375"
  rift-chalk: "#eaeff5"
  rift-paper: "#ffffff"
  rift-mist: "#f2f6fa"
  slate-ink: "#0b1420"
  slate-muted: "#4b5f75"
  deep-river: "#007396"
typography:
  wordmark:
    fontFamily: "Oxanium, Noto Sans KR, sans-serif"
    fontSize: "1.3125rem"
    fontWeight: 700
    lineHeight: "1"
  page-title:
    fontFamily: "Noto Sans KR, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 700
    lineHeight: "2rem"
  section-title:
    fontFamily: "Noto Sans KR, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: "1.5rem"
  body:
    fontFamily: "Noto Sans KR, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.45"
  label:
    fontFamily: "Noto Sans KR, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: "1rem"
rounded:
  box: "0.5rem"
  form: "0.375rem"
  small: "0.25rem"
spacing:
  2: "0.5rem"
  3: "0.75rem"
  4: "1rem"
  6: "1.5rem"
  8: "2rem"
components:
  rail:
    backgroundColor: "{colors.rift-basalt}"
    textColor: "{colors.chalk}"
    padding: "1.25rem 0.75rem"
  phase-lock:
    backgroundColor: "{colors.fog-slate}"
    textColor: "{colors.chalk}"
    rounded: "{rounded.box}"
    padding: "0.625rem 0.875rem"
  button-primary:
    backgroundColor: "{colors.nexus-cyan}"
    textColor: "{colors.nexus-ink}"
    rounded: "{rounded.form}"
    padding: "0.5rem 1rem"
  lane-cell:
    backgroundColor: "{colors.fog-slate}"
    rounded: "{rounded.small}"
    padding: "0.5rem 0.75rem"
  status-tag:
    typography: "{typography.label}"
    rounded: "{rounded.small}"
    padding: "0.125rem 0.5rem"
---

# Design System: Monkeybot

## Overview

**Creative North Star: "소환사의 협곡 전술 상황판"**

서버 운영자는 저녁, 어두운 방에서 Discord와 리그 오브 레전드 클라이언트를 함께 켜 둔 채 내전을 진행한다. 화면은 그 장면의 조명을 따른다. 왼쪽 전술 레일이 서버와 메뉴를 고정하고, 작업 영역은 전장 슬레이트 바탕 위에서 우상단으로 옅게 번지는 넥서스 시안을 받는다. 현재 단계와 다음 행동만 시안으로 점등하고, 나머지는 전장의 금장과 회청색 선으로 물러난다.

이 시스템은 UI 라이브러리에 기대지 않는다. 모든 조작은 네이티브 HTML 요소이고, 공통 프리미티브가 한 번만 정의된다. 세계관은 색·타이포그래피·밀도·하나의 시그니처 동작으로만 들어오며, 내비게이션과 컨트롤은 운영 화면의 관습을 지킨다.

## Colors

- **협곡 현무암 `#080c12`**: 페이지 바탕이자 좌측 전술 레일.
- **전장 슬레이트 `#0e151f` / `#141e2c`**: 카드, 단계 바, 명부 표면.
- **넥서스 시안 `#00d4ff` / `#33ddff`**: 현재 단계, 선택, 주요 행동. 한 화면에서 의미가 하나다.
- **포지션 금장 `#d4b375`**: Riot 5포지션 심볼과 보조 강조. 레드/블루 진영색과 분리한다.
- **전장 잉크 `#eaf2fa`, 보조 `#8ea4be`**: 본문과 메타데이터.
- **라이트: 전장 석회암 `#eaeff5` / `#ffffff` / `#f2f6fa`**, 잉크 `#0b1420`, 보조 `#4b5f75`, 청록 `#007396`.
- 상태색 `success`·`warning`·`error`·`info`는 진영색과 분리한다. 블루/레드 진영은 `--color-team-blue`·`--color-team-red`로만 쓴다.

## Typography

- **워드마크**: Oxanium 700. 서비스 이름만 이 서체를 쓴다.
- **본문·메뉴·컨트롤**: Noto Sans KR 400/500/600/700.
- **숫자**: 기본 `font-variant-numeric: tabular-nums`. 단계 번호·스코어·쪽 번호가 흔들리지 않는다.
- 위계는 크기보다 굵기·괘선·시안 점등으로 만든다. 제목 위에 작은 kicker를 두지 않는다.

## Shape and Depth

- 채움 컨트롤은 6px 모서리와 시안 채움을 쓴다. 모따기(clip-path)는 쓰지 않는다.
- 패널은 `.hex-panel`: 1px 전장 괘선과 8px 모서리, 그림자 없음. 깊이는 표면 단계와 괘선으로만 만든다.
- 단계 바는 한 상자의 네 칸이다. 현재 칸만 밝은 표면과 2px 시안 밑줄을 갖고, 칸 사이는 1px 괘선이다.
- 표 행은 46px 높이와 1px 괘선. 좌우에 굵은 색 띠를 두지 않는다.

## Components

- **Left rail**: 224px. 로고·Oxanium 워드마크, 서버 선택, 서버 메뉴 5종, 하단 계정. 현재 항목은 시안 틴트와 시안 글자.
- **Phase lock**: 네 칸. 각 칸에 26px 번호 배지, 단계명, 사유. 활성 칸 안에 `모집 마감` 같은 단일 주요 행동.
- **Lane matrix**: 공식 Riot 5포지션 심볼과 `주 n · 부 m` 집계. 주 포지션이 팀 수를 넘으면 경고 톤. 좁은 화면에서는 flex로 접힌다.
- **Roster**: 머리에 인원 필·필터·관리 버튼, 본문에 3열 표. 28px 이니셜 크레스트, 이름·Riot ID, 포지션 칩, 상태 태그.
- **Right altar**: 편성 방식(수동/경매)과 내 신청 카드. 6px 모서리, 1px 괘선.
- **Dialog / Popover / Toast**: 네이티브 `<dialog>`, 절대 위치 메뉴, `aria-live` 토스트. 화면 모드 전환은 하단 계정 메뉴 안에 둔다.

## Layout

- 1024px 이상에서 224px 레일 + 작업 영역 그리드. 작업 영역은 24px 안쪽 여백을 두고 레일과 맞닿는다.
- 내전 상세는 단계 바 아래 2열이다. 넓은 화면은 `1fr + 336px`, 1280px 미만은 한 열로 쌓는다.
- 좁은 화면에서는 상단 바 + 오른쪽 메뉴 시트를 쓴다. 데스크톱 레일과 동시에 렌더링하지 않는다.

## Do

- 현재 단계와 다음 행동을 한눈에 보이게 한다.
- 상태를 문구와 색으로 함께 알린다.
- 한국어 어절 단위 줄바꿈을 유지한다.
- 실제 데이터에 없는 수치나 서사를 만들지 않는다.

## Don't

- 그라데이션 텍스트, 좌우 3px 색 띠, 이모지 아이콘을 쓰지 않는다.
- 모따기(clip-path)나 하드 오프셋 그림자를 쓰지 않는다.
- 같은 조작을 레일·본문·빈 상태에 중복하지 않는다.
- 시안을 오류·경고·레드 진영 색으로 다시 쓰지 않는다.
