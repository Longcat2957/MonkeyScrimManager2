# MonkeyScrimManager2

## Project Documentation

- `docs/purpose.md`: Project vision, goals, and constraints.
- `docs/web/routing.md`: Agreed page routes, layout ownership, and navigation structure (design; not yet implemented).

Consult the relevant documents when making product,
feature, or architectural decisions.

## Naming and Branding

- `MonkeyScrimManager2` (`MSM2`) is the internal project name. Use it for the repository, packages, and development documentation.
- The user-facing service name is **`Monkeybot`**. Preserve this exact spelling; `Monketbot` is a typo.
- Use `Monkeybot` in UI headers, headings, navigation, browser titles, metadata, and user-facing bot messages. Do not display the internal project name in these places.
- In web code, import `SERVICE_NAME` from `#lib/branding.ts` for the service name instead of repeating a literal string.
- Render the `Monkeybot` wordmark with the `font-brand` Jersey 10 font (regular 400). Keep body text, navigation, and STDF controls in Noto Sans KR.
- Before completing UI changes, check visible text and metadata and run `pnpm check:branding` (also included in `pnpm check`). The check rejects internal project names, `Monketbot`, and direct `Monkeybot` literals in web `.svelte` and `.html` files.

## Project Principles

- MSM2(This project) is a clean-slate rewrite of MSM1.
- MSM1(https://github.com/Longcat2957/MonkeyScrimManager) is a reference, not an implementation template.
- Do not assume MSM1 features must be preserved.
- Prefer simple, maintainable solutions.
- Avoid unnecessary complexity and abstractions.
- Implement external API endpoints only when a currently agreed service feature needs them. Identify the consuming feature before adding an endpoint; upstream API completeness, parity with MSM1, and possible future use are not sufficient reasons.

## Service Workflow

- 서비스는 모집·참가자 관리·팀 편성(수동 또는 경매)·대진 운영을 담당한다. 밴픽·픽 순서·경기 중 진행 과정은 게임에서 처리하며 서비스의 입력·진행 관리 대상으로 만들지 않는다.
- 전적은 ROFL의 최종 결과로 자동 기록한다. 정상 파일은 서버가 권한·참가자 연결·중복·데이터를 검증한 뒤 저장하며, 수동 결과 입력이나 매번 사람의 승인을 요구하지 않는다. 연결 실패·데이터 충돌 등은 예외로 처리한다.
- 하드 피어리스는 이전 경기의 실제 사용 챔피언을 기준으로 안내하며, 위반을 이유로 ROFL 업로드나 결과 등록을 막지 않는다.

## Code Comments

- 코드 주석은 한국어로 작성한다. 한 줄·블록 주석, JSDoc/TSDoc, 테스트·설정·SQL의 설명 주석에 모두 적용하며, 주석을 추가하거나 수정할 때 이 규칙을 따른다.
- 식별자, 공식 기술명, URL, 컴파일러·린터 등의 도구 지시문은 원문을 유지한다.

## Frontend Implementation

- 반복되는 UI·동작은 역할 단위의 컴포넌트로 모아 코드 중복을 줄인다. 실제 반복과 공통 책임이 확인된 범위만 공통화하며, 줄 수를 줄이기 위한 과도한 추상화나 읽기 어려운 축약은 피한다.
- 디자인은 STDF 네이티브 컴포넌트를 우선 사용한다. 설치된 버전의 공식 API·옵션으로 해결할 수 있는 UI를 직접 다시 구현하지 않는다.
- STDF 컴포넌트를 공통 컴포넌트로 감싸는 것은 서비스 공통 동작이나 구성이 필요할 때로 한정한다. 모든 STDF 컴포넌트에 일괄적으로 래퍼를 만들지 않는다.
- 페이지는 화면 조립, 컴포넌트는 표현과 상호작용, 라우트의 데이터 로딩은 데이터 준비를 담당한다. 컴포넌트는 필요한 데이터를 전달받아 사용하며 목 데이터나 API의 구체적인 조회 방식에 의존하지 않는다.
- 색상·폰트·간격 등 반복되는 디자인 값은 STDF 설정과 전역 토큰으로 관리한다. 컴포넌트 옵션과 공통 테마를 먼저 활용하고, 개별 화면의 CSS 예외는 필요한 범위로 제한한다.
- 화면을 설계할 때 정상·로딩·빈 데이터·오류·비활성 상태를 함께 고려하고 해당 기능에 필요한 상태를 제공한다.
- 반응형 배치와 접근성을 처음부터 고려한다. 모바일 화면, 키보드 조작, 보이는 포커스, 입력 라벨과 접근 가능한 이름을 확인한다.

## Frontend Mock Data

- 프론트 목 데이터는 `apps/web/src/lib/mocks/`에서 관리하며 페이지·컴포넌트 안에 흩어 놓지 않는다.
- 준비 단계에서는 보관 위치만 정한다. 실제 데이터·타입·조회 함수는 해당 화면을 구현할 때 필요한 만큼 추가한다.

## Web UI and Content Rules

- Evaluate the complete rendered page, including the shared header, body, footer, menus, and dialogs.
- **One function, one control:** provide one user-operable control for the same action and target on a page, including settings and navigation destinations. Do not duplicate it in another region or under a different label. Reusing the same component source does not justify rendering the same control multiple times.
- **One explanation, one place:** state each fact or instruction once, where it is needed. Paraphrasing it in a heading, subtitle, card, help text, tooltip, or notice still counts as duplication.
- Desktop and mobile variants must be mutually exclusive; two versions of the same control or explanation must never be simultaneously visible, keyboard-accessible, or operable.
- Add UI and copy only when they support a distinct user action, decision, or necessary feedback. Do not fill space with redundant cards, badges, descriptions, repeated status messages, speculative links, or controls without a working purpose. Keep implementation and development details out of product screens.
- Labels, accessible names, and result feedback must serve their own interaction purpose, without repeating an existing explanation.
- Before completing web work, review the rendered page in each relevant viewport and interaction state. Check for duplicate operations and repeated meaning across shared components and page content; consolidate or remove them. Do not treat different wording or separate component files as proof that the UI is distinct.

## Application Structure

- `apps/web`: SvelteKit full-stack application.
- `apps/bot`: Bot application.
- `deploy/`: Deployment configurations.
