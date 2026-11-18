---
version: 1
slug: "src-routes-g-guildid-scrims-scrimid-page-svelte"
primary_target: "src/routes/g/[guildId]/scrims/[scrimId]/+page.svelte"
related_targets:
  - "src/routes/g/[guildId]/scrims/[scrimId]/manual/+page.svelte"
  - "src/routes/g/[guildId]/scrims/[scrimId]/auction/+page.svelte"
  - "src/routes/g/[guildId]/scrims/[scrimId]/bracket/+page.svelte"
  - "src/routes/g/[guildId]/scrims/[scrimId]/result/+page.svelte"
  - "src/routes/g/[guildId]/matches/[matchId]/+page.svelte"
---

## Direction contract

**Scope & mode:** 내전 상세 `/g/[guildId]/scrims/[scrimId]` 및 바로 이어지는 내전 하위 작업판(수동 편성·경매·대진·결과)과 경기 상세. Operate 모드, 데스크톱 운영자가 주 사용자이며 공개 참가자도 열람한다.

**THESIS:** 서버 내전은 소환사의 협곡 전술 상황판이다. 왼쪽 전술 레일이 서버와 메뉴를 고정하고, 오른쪽 작업 영역은 단계 바·5라인 전력 띠·소환사 명부로 작전을 읽는다. 단계는 네 칸의 잠금 바이고 현재 칸에만 다음 행동(`모집 마감`)이 붙는다. 흔한 흰 카드 대시보드의 뼈대를 거부한다.

**OWN-WORLD:** 협곡 현무암(`#080c12`)과 전장 슬레이트(`#0e151f`/`#141e2c`) 바탕, 넥서스 시안(`#00d4ff` 다크 / `#007396` 라이트) 단일 강조, 포지션 금장(`#d4b375`/`#8c6622`), 1px 전장 괘선. 워드마크는 Oxanium 700, 본문·메뉴·컨트롤은 Noto Sans KR. 공식 Riot 5포지션 심볼(`static/riot/positions/*.svg`)과 Monkeybot의 사이버 원숭이 헤드셋 로고(`static/brand/logo.png`). 모따기·금속 세공 장식은 쓰지 않는다.

**STORY:** 운영자는 내전이 어느 단계에 있고 다음에 무엇을 해야 하는지 1초 안에 읽는다. 참가자는 자기 신청 상태와 포지션을 확인하고, 운영자는 선발 10인의 포지션 분포를 판단해 수동 편성과 경매 중 하나를 고른다.

**FIRST VIEWPORT:** 왼쪽 224px 전술 레일(로고·Oxanium 워드마크·서버 선택·서버 메뉴 5종·하단 계정). 작업 영역은 우상단에서 옅게 번지는 시안 그라데이션 위에 제목 행(제목·모집 중·일정·2팀·하드 피어리스 각인·운영 메뉴), 이어지는 4칸 단계 바(현재 칸에 `모집 마감`), 그 아래 `1fr + 336px` 2열. 왼쪽은 5라인 전력 띠와 소환사 명부 표, 오른쪽은 편성 방식과 내 신청.

**FORM:** 1번 소환사의 협곡 전술 상황판(`rift-tactical.html`). 사용자 재선택으로 3번에서 전환. seed:249c1bf3170b15dd

모집·참가자 상세는 원본 시안의 배치를 유지한다. 수동 편성과 경매도 기존 작업 순서, 컨트롤 위치, 드래그·키보드 조작을 유지한다. 이 두 화면은 계층·표면·여백·선택 상태로 Rift 디자인을 적용한다. 길드 홈과 경기 기록은 같은 색·서체·컨트롤을 쓰되 페이지의 주요 판단에 맞춰 배치한다. 시안의 예시 인원·입찰가로 업무 규칙을 바꾸지 않는다.

**FINISH:** unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
