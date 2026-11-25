---
version: 1
slug: src-routes-dev-landing-page-svelte
primary_target: src/routes/dev/landing/+page.svelte
---

## Direction contract

**범위:** 외부 Discord 서버 운영자 대상 Persuade 페이지. 지금은 `/dev/landing`에서만 확인한다. 운영 루트, 로그인 후 서버 진입, Discord 앱 설정과 전역 명령은 변경하지 않는다. 직접 설치는 공개 결정 이후의 행동이다.

**THESIS:** ‘두 화면, 한 내전’. 기능별 광고 카드 대신 같은 내전의 Discord 모집 글과 웹 경기 기록을 맞대어 보여 준다.

**OWN-WORLD:** Rift 표면과 가는 구분선, 시안 동작 한 개, 양 진영 색, 고정폭 숫자. 워드마크는 Oxanium, 한국어는 Noto Sans KR. 기존 셸과 푸터의 조작을 중복하지 않는다.

**STORY:** 모집 글에서는 누가 오는지 보이고 웹에서는 같은 사람의 결과가 남는다. 한 경기의 예시를 보고, 페이지 안에서 첫 내전을 여는 순서를 따라간다.

**FIRST VIEWPORT:** 큰 한글 헤드라인과 짧은 설명 바로 옆에 ‘사용법 보기’. 이어지는 한 장의 기록지는 모집 명단과 경기 결과를 좌우에 놓고, 모바일에서는 같은 순서로 쌓는다. 사용법 링크는 같은 문서의 절로 이동한다. 실서버 명단은 쓰지 않는다.

**FORM:** 사용자 선택 ‘두 화면, 한 내전’(6번째 구조), seed:40acba6d48ca54fc.

**FINISH:** unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
