---
version: 1
slug: "src-routes-site-page-svelte"
primary_target: "src/routes/(site)/+page.svelte"
related_targets: ["src/lib/components/landing/TryScrim.svelte"]
---

## Scope

`/` 소개 화면. 모드 Persuade(체험 영역 안은 Operate의 정확성). 기존 Rift 전술 상황판 세계관 안의 화면 구성 결정이다.

## Audience and action

자기 Discord 서버에 봇 도입을 고민하는 운영자. 주 행동은 `서버에 봇 추가`(초대 링크 공개 전에는 설치 안내). 로그인 사용자는 `내 서버로 이동`.

## Direction contract

- THESIS: 설명 카드 대신 실제 서비스 흐름을 직접 진행한다. 헤드라인·소개문·카드 줄로 된 정형 랜딩을 거절한다.
- OWN-WORLD: 기존 운영 화면의 패널·단계 바·포지션 표기·경매 작업판을 그대로 쓴다. 랜딩 전용 장식 컴포넌트를 만들지 않는다.
- STORY: 채팅 모집 글의 참가하기 → 운영자 참가자 확인·모집 마감 → 팀장 경매 → ROFL 업로드·세트 결과.
- FIRST VIEWPORT: 한 줄 헤드라인과 시작 버튼 아래, 넓은 화면에서 채팅 모집 글과 그 옆에 흐리게 보이는 운영 상황판이 이음매처럼 붙는다.
- SIGNATURE: 단계 조작마다 가로 트랙이 한 칸씩 밀리며 다음 운영 화면이 들어온다(모션 감소 시 즉시 전환).
- RISK: 운영 화면 밀도가 첫 방문자에게 무거울 수 있어 단계마다 한 문장 안내만 둔다.
- seed: seed:9779082df12a4991 (사용자가 다시 뽑기 대신 구조 3 기반 방향을 직접 지정: pinned)

## Open decisions

- 수동 편성 분기는 제외했다.
- 서비스에 경기별 MMR 증감 UI가 없어 체험에서도 보여 주지 않는다.
