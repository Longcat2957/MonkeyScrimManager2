# MonkeyScrimManager2

## Project Documentation

- `docs/purpose.md`: Project vision, goals, and constraints.

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
