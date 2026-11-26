---
name: Monkeybot
description: 리그 오브 레전드 내전의 단계·참가자·기록을 소환사의 협곡 전술 상황판 문법으로 보여 주는 운영 화면
colors:
  rift-basalt: "#080c12"
  night-rail: "#05080d"
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
    backgroundColor: "{colors.night-rail}"
    textColor: "{colors.chalk}"
    padding: "1.125rem 0.875rem"
  phase-lock:
    backgroundColor: "{colors.fog-slate}"
    textColor: "{colors.chalk}"
    rounded: "{rounded.box}"
    padding: "0.625rem 0.875rem"
  button-primary:
    backgroundColor: "{colors.nexus-cyan}"
    textColor: "{colors.nexus-ink}"
    rounded: "{rounded.form}"
    padding: "0 0.75rem"
  lane-cell:
    backgroundColor: "{colors.fog-slate}"
    padding: "0.5rem 0.75rem"
  status-tag:
    typography: "{typography.label}"
    rounded: "{rounded.small}"
    padding: "0 0.5rem"
---

# Design System: Monkeybot

## Overview

**Creative North Star: "소환사의 협곡 전술 상황판"**

[원본 목업](.impeccable/mocks/decision/rift-tactical.html)은 내전 상세의 시각 기준이다. 왼쪽 레일은 서버 문맥을 유지하고, 오른쪽 작업 영역은 단계·인원·기록과 지금 할 수 있는 행동을 보여 준다. 목업의 예시 데이터나 권한을 실제 운영 정책으로 옮기지 않는다.

## Colors

어두운 바탕 위에 회청색 표면과 얇은 괘선을 쓴다. 넥서스 시안은 현재 위치·선택·주요 행동, 금장은 포지션을 표시한다. 밝은 테마는 같은 의미를 밝은 표면과 짙은 청록으로 옮긴다. 블루·레드 진영은 성공·오류와 별개의 색 역할이다. 실제 테마별 값은 [layout.css](src/routes/layout.css)에 있다.

## Typography

워드마크는 Oxanium, 본문·메뉴·컨트롤은 Noto Sans KR이다. 단계 번호와 인원 등 짧은 강조 수치는 워드마크 서체를 사용할 수 있다. 점수·순위에는 고정폭 숫자를 쓰고 긴 한국어 이름은 어절 단위로 줄바꿈한다.

## Layout

서버·계정 화면은 1024px 이상에서 224px 왼쪽 레일과 작업 영역, 좁은 화면에서 상단 바와 오른쪽 메뉴 시트를 사용한다. 소개·안내·정책 화면은 본문 폭(72rem)에 맞춘 상단 내비게이션 바를 쓰며, 현재 메뉴는 단계 바와 같은 시안 밑줄로 표시한다. 장문 문서는 42rem 본문과 고정 목차를 쓴다. 소개 화면의 체험은 채팅 모집 글과 운영 화면 칸을 가로 트랙에 이어 두고, 넓은 화면에서는 다음 칸의 가장자리를 흐리게 보이며 단계마다 트랙을 한 칸씩 민다. 내전 요약의 단계는 한 상자의 네 칸으로 이어지며 좁으면 두 칸씩 접힌다. 넓은 화면에서 포지션 분포·참가자 명부 옆에 권한에 맞는 편성·신청 패널을 둔다. 다른 화면에 내전 요약의 열 구성을 강제하지 않는다.

## Components

- 패널은 얇은 괘선과 8px 모서리로 구분한다. 명부·경기 표는 행 맞춤을 유지하고, 상태와 숫자를 색만으로 구별하지 않는다.
- 현재 단계에는 선택 표면과 시안 밑줄을 사용한다. 다른 단계로 가는 링크와 현재 단계의 실행 버튼을 구분한다.
- 포지션 분포는 공식 5포지션 심볼과 주·부 인원을 사용한다. 주 포지션 인원이 팀 수를 넘으면 경고한다.
- 버튼·입력·대화상자는 [공통 컴포넌트 선택표](../../docs/web/design-system.md)를 따른다. 네이티브 입력·링크·버튼의 의미와 키보드 조작을 유지한다.

## Do's and Don'ts

- 같은 동작을 레일·본문·빈 상태에 반복하지 않는다. 불가능한 조작은 이유를 알린다.
- 그라데이션 텍스트, 굵은 장식용 옆선, 모따기, 이모지 대체 아이콘을 쓰지 않는다. 배경의 옅은 시안과 의미 있는 상태 강조를 구분한다.
