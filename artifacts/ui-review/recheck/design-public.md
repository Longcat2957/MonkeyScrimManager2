# 공개·계정 8화면: Impeccable 디자인 적용 재평가

Method: dual-agent 작업의 독립 Assessment A (`/root/design_review`). 이 문서는 시각·UX 판단이며 detector 결과를 결론의 근거로 사용하지 않았다.

2026-11-14, push 완료 통지 뒤 `897eddf`의 개발 서버를 새 Playwright MCP 페이지로 열었다. 대상은 home/docs/terms/privacy/me/backoffice/components/error의 1440×1000·390×844, primary/dark 32조건이다. 기본 최신 이미지32장과 수정 전16장을 직접 읽고 비교했다. 추가 FAQ·빈 계정·입력 오류12장도 직접 읽었다. 키보드·메뉴·테마 유지·재시도·입력 보존·로컬 파일 선택은16조건에서 재확인했다. 원본 after 이미지는 보존했다.

## 판정

**필요한 개선은 실제 화면에 적용됐지만, 공개 진입과 안내 문서의 정보 설계에는 부분 충족이 남는다.** 적용 명령 수나 DOM 통과만으로 디자인 목표 달성을 선언할 수 없다.

오류 화면은 사람에게 필요한 제목이 첫 정보가 됐고, 문서 목차와 경매 설명은 모바일에서 찾고 훑기 쉬워졌다. 계정과 백오피스는 이미 적합했던 간결한 구조를 유지하면서 빈 상태·복구·조작성을 보완한 것이 적절하다. 홈은 설명의 중복이 줄었지만 처음 온 사람이 시작하는 경로를 이해하는 연결이 여전히 약하다. 약관·개인정보는 공통 프레임 개선과 정책 내용 준비 상태를 따로 판단해야 한다.

**제품 고유성:** Slate/STDF의 차분한 톤과 Jersey 워드마크는 일관된다. 계정·오류·상태 화면은 범용적인 형태지만 해당 목적에 맞는다. 홈에서는 실제 내전 운영의 특징이 대부분 네 단계의 글에만 담겨 있어, 문구를 다른 서비스로 바꾸기 쉬운 인상이 남는다. 새 장식·카드를 추가하기보다 실제 시작 흐름을 더 분명히 하는 편이 제품 목적에 맞는다.

## 화면별 전후 판단

| 화면 | 실제로 달라졌거나 유지할 이유 | Impeccable 목표 판정 | 남은 부분 |
| --- | --- | --- | --- |
| home | 긴 소개에서 아래 단계와 중복되는 설명을 덜었다. 모바일에서 로그인 경로가 헤더에 보인다. 제목→소개→네 단계의 순서는 읽힌다 | distill·clarify는 부분 충족, 기존 typeset·quieter는 유지가 적절. onboard·layout은 부분 | 단계 설명 뒤에 로그인·서버 선택으로 이어지는 관계가 명시되지 않는다. 처음 온 사람에게 역할별 시작점을 설명하는 위계가 부족하다 |
| docs | 작은 줄바꿈 링크가 모바일 두 열의 넉넉한 목차가 됐다. 경매의 한 덩어리 문단이 입찰·수동 배치·유찰 처리로 나뉘었다. 제목·본문·간격은 긴 문서를 읽는 목적에 맞는다 | adapt·clarify·typeset·polish의 해당 개선은 충족. 전체 layout·distill·onboard는 부분 | 참가자에게 필요한 안내와 운영자 전용 설명이 같은 한 줄의 정보 구조에 섞여 있다. 재방문자가 자신의 과업만 찾는 구조는 더 정리할 수 있다 |
| terms | 제목·준비 중 원문을 유지하고 모바일 로그인·푸터 조작을 개선했다 | 공통 adapt·polish는 충족. 본문 디자인 목표는 콘텐츠 대기 | 실제 약관 읽기 목적은 충족하지 못한다. 승인 본문이 없는 상태를 시각적 완성으로 표시하지 않는다 |
| privacy | 제목·준비 중 원문을 유지하고 공통 프레임을 개선했다 | 공통 adapt·polish는 충족. 본문 디자인 목표는 콘텐츠 대기 | 실제 처리방침 읽기 목적은 충족하지 못한다. 내용·적용일·문의 경로를 추정해 넣을 수 없다 |
| me | 프로필→서버별 계정 목록의 간단한 그룹을 유지했다. 새 빈 상태는 운영자에게 연결을 요청하라는 다음 행동을 한 곳에 설명한다. 자체 연결 버튼을 만들지 않은 것이 실제 권한과 맞는다 | 기존 layout·quieter 유지와 clarify·harden·adapt 보완은 적절하게 충족 | 기본 배치에 새로운 장식이나 영역을 추가할 이유를 발견하지 못했다. 개발 목 미리보기의 로그인 문구와 실제 인증 헤더는 구분해서 해석해야 한다 |
| backoffice | 서비스 이름·상태·세부 설명의 읽기 순서를 유지했다. 상태 글자와 재확인 조작의 표현이 좋아졌고, 재확인 후 같은 영역에서 결과를 읽는다 | 기존 layout·quieter 유지, colorize·harden·polish 보완 충족 | 짧은 상태 페이지의 빈 공간을 불필요한 카드로 채울 필요는 없다. 이 화면은 읽기와 재확인이 목적이며 장애 조치 도구까지 제공한다고 평가하지 않는다 |
| components | 링크가 실제 예제로 이동하고, 버튼 결과·재시도·입력 오류·파일 선택이 눈에 보이는 반응을 제공한다. 파일 선택 영역은 데스크톱의 큰 정사각형과 모바일의 작은 칸에서 일관된 비율로 정리됐다 | clarify·harden·adapt·polish 충족. 기존 간격과 예제별 구분은 유지가 적절 | 개발 전용 비교 도구다. 여러 상태를 함께 보여 주는 것을 일반 사용자 화면의 혼란으로 오판하지 않는다 |
| error | 크게 강조한 403 숫자를 보조 정보로 낮추고 ‘접근 권한이 없어요’를 먼저 읽게 했다. 두 테마·두 폭 모두 원인→오류 번호→안내로 읽힌다 | distill·typeset·clarify·quieter·polish 충족 | 실제 연락 대상이 누구인지 아는 정도는 원래 진입 문맥에 달렸다. 이 개발 오류 화면의 문구만으로 실제 운영자 연락 경로까지 확인했다고 주장하지 않는다 |

‘유지’는 변경을 덜 했다는 감점이 아니다. 이미 목적에 맞는 구성은 보존하고 실제로 필요한 차이를 고치는 것이 이번 목표에 맞다. 이8화면에 새 애니메이션이나 장식 효과를 더할 필요는 확인되지 않았다.

## 전후 이미지 근거

아래의 수정 전·최신 링크를 직접 열어 비교했다. 최신 dark 파일도 모두 읽었다. 전체32조건의 URL·해시·브라우저 기록은 [public.json](public.json)에 있다.

| 화면 | 수정 전 desktop / mobile | 최신 desktop / mobile | 최신 dark desktop / mobile |
| --- | --- | --- | --- |
| home | [D](../before/home-desktop.png) · [M](../before/home-mobile.png) | [D](public/home-desktop.png) · [M](public/home-mobile.png) | [D](public/home-dark-desktop.png) · [M](public/home-dark-mobile.png) |
| docs | [D](../before/docs-desktop.png) · [M](../before/docs-mobile.png) | [D](public/docs-desktop.png) · [M](public/docs-mobile.png) | [D](public/docs-dark-desktop.png) · [M](public/docs-dark-mobile.png) |
| terms | [D](../before/terms-desktop.png) · [M](../before/terms-mobile.png) | [D](public/terms-desktop.png) · [M](public/terms-mobile.png) | [D](public/terms-dark-desktop.png) · [M](public/terms-dark-mobile.png) |
| privacy | [D](../before/privacy-desktop.png) · [M](../before/privacy-mobile.png) | [D](public/privacy-desktop.png) · [M](public/privacy-mobile.png) | [D](public/privacy-dark-desktop.png) · [M](public/privacy-dark-mobile.png) |
| me | [D](../before/me-desktop.png) · [M](../before/me-mobile.png) | [D](public/me-desktop.png) · [M](public/me-mobile.png) | [D](public/me-dark-desktop.png) · [M](public/me-dark-mobile.png) |
| backoffice | [D](../before/backoffice-desktop.png) · [M](../before/backoffice-mobile.png) | [D](public/backoffice-desktop.png) · [M](public/backoffice-mobile.png) | [D](public/backoffice-dark-desktop.png) · [M](public/backoffice-dark-mobile.png) |
| components | [D](../before/components-desktop.png) · [M](../before/components-mobile.png) | [D](public/components-desktop.png) · [M](public/components-mobile.png) | [D](public/components-dark-desktop.png) · [M](public/components-dark-mobile.png) |
| error | [D](../before/error-desktop.png) · [M](../before/error-mobile.png) | [D](public/error-desktop.png) · [M](public/error-mobile.png) | [D](public/error-dark-desktop.png) · [M](public/error-dark-mobile.png) |

## 우선순위가 있는 후속 판단

### A-PUB-01 · P2 · 홈의 시작 안내가 과정 설명과 연결되지 않는다

4단계는 서비스를 이해시키지만, 지금 해야 하는 행동을 안내하는 구조는 약하다. 로그인은 우측 헤더의 일반 텍스트이며 본문은 시작 경로를 설명하지 않는다. 특히 모바일에서 먼저 보이는 것은 과정이고 서버 선택은 로그인·현재 문맥에 따라 다르게 나타난다. `onboard`·`layout`·`clarify`로 기존의 단일 로그인/서버 선택 경로가 다음 단계라는 관계를 분명히 해야 한다. 같은 로그인 버튼을 본문에 복제하거나 새 서버 탐색 기능을 가정하면 안 된다.

완료 기준은 처음 방문한 참가자와 운영자가 본문 첫 화면에서 시작 위치를 설명할 수 있는 것이다. 이는 현재 이미지에서 확인한 정보 설계 판단이며 사용자 성공률을 측정한 결과는 아니다.

### A-PUB-02 · P2 · 이용 안내가 역할보다 전체 기능 순서에 치우쳐 있다

모집 참여·ROFL·FAQ를 찾는 참가자는 팀 편성·대진·되돌리기 같은 운영자 정보를 같은 목차에서 분류해야 한다. 모바일 목차의 터치 영역은 좋아졌지만 관련 과업을 선택하는 부담은 남는다. `distill`·`layout`·`onboard`로 기존 내용을 참가·운영의 과업 묶음으로 정리하고, 현재의 단일 목차가 해당 순서를 반영하게 하는 것이 구체적인 다음 개선이다. 필수 규칙이나 예외를 삭제해서 짧게 만들면 안 된다.

완료 기준은 참가자가 운영 설정을 읽지 않고 자신의 신청·기록 과업을 찾고, 운영자는 팀 편성·대진·복구 순서를 훑을 수 있는 것이다.

### A-PUB-03 · P3 · 개발 홈 바로가기는 좁은 화면에서 작업 탐색보다 경로 읽기가 커진다

개발 전용14개 바로가기는 같은 비중으로 나열되고 긴 URL은 줄바꿈된다. 현재 390px 이미지에서 바로가기 목록이 소개보다 훨씬 긴 영역을 차지한다. `layout`·`typeset`·`distill`로 개발 탐색도 과업 묶음에 맞추고 경로의 보조 위계를 낮출 여지가 있다. 실제 코드는 `if dev`로 제한하므로 이 문제를 production 방문자의 화면 문제로 확대하지 않는다. 개발 경로를 제거하거나 동일 목적지 링크를 두 벌 만드는 수정은 필요하지 않다.

정책2화면의 본문 부재는 위 세 디자인 이슈와 별도의 콘텐츠 블로커다. 승인을 받은 내용을 제공받아야 하며 Impeccable 실행 여부로 해결됐다고 볼 수 없다.

## 인지 부담과 사용자별 관찰

- 처음 오는 참가자: 홈의 과정은 이해하기 쉽지만 시작 위치를 스스로 연결해야 한다. 빈 계정은 서버 운영자에게 요청한다는 다음 행동이 분명해졌다.
- 재방문 운영자: 백오피스의 한 번의 재확인과 이름→상태→설명 순서는 효율적이다. 안내 문서에서는 팀 편성·대진·되돌리기 정보를 자신의 역할로 묶어 훑기 어렵다.
- 모바일·키보드 사용자: 목차의 두 열과 여유 있는 조작, 읽기 순서, 오류 필드 연결이 도움이 된다. 물리 모바일·실제 보조기기 발화 전체까지 확인한 것은 아니다.
- 개발 검토자: 홈의14개 동등한 선택지는4개를 넘는 분기다. 문서 목차6개는 과업 찾아보기 목록이며 개수만으로 실패로 보지 않는다. 갤러리의7개 상태 배지는 조작 선택지가 아니다.

감정 흐름은 설명을 이해한 뒤 시작 위치를 추론하는 홈에서 끊긴다. 반대로 빈 계정의 다음 행동과 입력 근처의 오류는 막힘을 설명하고, 오류403의 사람 중심 제목은 불필요한 위압감을 줄인다. 빈 공간을 채우거나 화려한 효과를 넣는 것이 이 문제들의 해법은 아니다.

## Nielsen 참고 평가

이 표는 이8화면의 주관적 UX 점검이며 전체20화면의 기존 점수와 비교할 수 없다. 완료 판정의 근거는 위 전후 관찰과 남은 과업이다.

| 항목 | 0–4 | 근거 |
| --- | --- | --- |
| 상태 가시성 | 3 | 상태·오류 제목·재확인 피드백을 읽을 수 있다 |
| 현실의 언어 | 3 | 모집·팀·경기·Riot 계정 문구가 실제 도메인과 맞는다 |
| 사용자 제어 | 3 | 단일 경로와 닫기·재시도 등 필요한 조작을 보존한다 |
| 일관성 | 3 | 표면·글꼴·제목·공통 조작이 양 테마에서 이어진다 |
| 오류 예방 | 3 | 입력 이름·단일 오류·처리 상태 보완이 목적에 맞는다 |
| 기억보다 인지 | 2 | 홈의 시작점과 문서의 역할별 과업은 여전히 추론이 필요하다 |
| 효율 | 3 | 짧은 계정·상태 페이지는 불필요한 단계가 없다 |
| 미적 절제 | 3 | 큰 오류 코드를 낮추고 필요한 정보에 집중한다 |
| 오류 복구 | 3 | 빈 계정 안내·재시도·입력 보존을 제공한다 |
| 도움말 | 3 | 구체적인 안내는 있으나 역할별 탐색 구조를 더 정리할 수 있다 |
| 합계 | 29/40 | 디자인 완료 보증이나 개선율이 아니다 |

Questions skipped: 사용자가 기존 제품 맥락과 실제 화면을 근거로 자율 재점검을 요청했다. 이번 단계는 코드 변경 없이 확인과 판단을 기록한다.
