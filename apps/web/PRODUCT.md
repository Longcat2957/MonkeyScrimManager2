# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Discord 서버의 내전 운영자는 모집·참가자·팀·경기 운영을 관리한다. 참가자는 내전을 신청하고 진행 상황과 전적을 확인한다. 비로그인·비소속 방문자도 활성 서버의 공개 화면을 열람할 수 있다. 서버 관리자와 서비스 운영자 권한은 별개다.

## Product Purpose

사용자 서비스명은 Monkeybot이다. 리그 오브 레전드 내전의 모집부터 전적까지 운영하며, 검증된 ROFL 최종 결과로 경기·MMR을 기록한다. 내부 프로젝트명은 MonkeyScrimManager2(MSM2)다.

## Operating Context

모집 → 선발 → 수동 편성 또는 경매 → 대진 → 경기(BO 시리즈)·세트 → ROFL 검증·기록. 출전 라인업은 경기 전체에 한 번 확정한다. 게임 내 밴픽은 게임이 처리한다. Riot 계정 연결은 서버별로 운영자가 관리한다.

## Capabilities and Constraints

- 기존 업무 규칙은 MSM1 실제 구현을 준용하며 UI 개선으로 의미·API·인증·권한을 변경하지 않는다.
- 정상 ROFL은 서버 검증 후 자동 등록한다. 매번 사람의 승인이나 수동 승패 입력을 추가하지 않는다.
- 불명확한 실제 시각·수치는 null을 유지한다. 희망 포지션이 확정 라인업을 대신하지 않는다.
- 하드 피어리스는 사용 챔피언 안내이며 결과 등록을 막지 않는다.
- 기존 SvelteKit3·Svelte5·STDF3·Tailwind4 구조를 사용한다. 목 데이터는 lib/mocks에 두고 실제 오류를 목 데이터로 대체하지 않는다.

## Brand Commitments

사용자 화면의 이름은 branding.ts의 SERVICE_NAME으로 가져온다. 워드마크는 Jersey 10 regular 400, 본문·메뉴·STDF 컨트롤은 Noto Sans KR이다. 기존 Slate 테마와 primary/dark 모드를 존중한다. 한국어 설명은 동작과 다음 행동을 명확히 전달한다.

## Evidence on Hand

확인 근거: ../../AGENTS.md, ../../README.md, ../../docs/purpose.md, ../../docs/web/README.md, ../../docs/web/routing.md 및 페이지별 문서와 현재 구현. 이번 요청은 기존 기능·브랜드·권한을 보존한 전체 UI 개선이다. 제품 정보는 이 근거에서 옮겼으며 새 마케팅 주장·사용자 조사 결과·성능 수치는 만들지 않았다.

## Product Principles

- 한 페이지에서 같은 기능은 한 조작, 같은 설명은 한 위치에 제공한다.
- 핵심 과업과 현재 상태를 먼저 이해하고 모바일·키보드로도 완료할 수 있게 한다.
- 기존 STDF API와 서비스 공통 컴포넌트를 우선 활용하고 실제 반복 책임만 추출한다.
- 오류에서 입력을 보존하고 가능한 복구를 제공한다.

## Accessibility & Inclusion

모바일·키보드·보이는 포커스·입력 이름·오버레이 복귀·긴 한국어와 확대를 검증한다. 공개·비활성·로딩·빈 데이터·오류·성공 상태를 고려한다. 특정 기기·보조기기의 실제 검증 여부는 ../../docs/ui-review/coverage.md에 별도 기록한다.
