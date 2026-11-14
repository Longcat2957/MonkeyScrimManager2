# 워크플로 후속 개선 완료 기록

이번 범위는 푸시된 `897eddf`의 재비평에서 남은 수동 편성 선택 맥락·해제 조작(DQ-01/04), 모집 요약의 관리자 우선순위(DQ-07), 실제 선발 관리 과정(DQ-08), 좁은 편성 행의 정보 잘림(DQ-11)이다. 해당 범위의 완료 조건을 충족했고 소스는 동결했다. 브랜드, 데이터 값, API 계약, 인증·권한, 수동 편성의 실시간 동작은 유지했다.

## 실제 디자인 효과

| 문제 | 이전 화면의 부족한 점 | 적용과 최종 판단 |
| --- | --- | --- |
| DQ-01 선택 맥락 | 긴 작업판에서 선택한 참가자와 취소 조작이 화면 밖으로 사라졌다. | 기존 선택 안내 한 곳을 고정 헤더 아래에 sticky로 유지했다. 선택자·자리 안내·취소가 함께 보이며 별도 안내나 취소 버튼을 추가하지 않았다. **충족**: 12조건에서 스크롤과 180회 키보드 포커스 이동 중 선택 맥락·조작이 가려지지 않았다. |
| DQ-04 해제 조작 | 실제 native 버튼의 작은 조작 영역이 76px 편성 행 안에서 불안정했다. | STDF 공개 `injClass`로 기존 아이콘의 버튼 영역만 44×44px로 확보했다. **충족**: 6개 배정 행을 각 기본 조건에서 측정했고 터치 배치·해제로 확인했다. |
| DQ-07 모집 요약 | 관리자에게 개인 신청·편성 방식이 반복 운영 과업보다 먼저 제시됐다. | 관리자 DOM과 시각 순서를 운영→참가자→내 신청/편성 방식으로 바꿨다. 비관리자는 개인 신청이 먼저다. **충족**: 390px에서 선발 관리가 y558에 나타나고 다음 행동이 더 빨리 드러난다. 이미지·단계 표시·기존 제품의 시각적 정체성은 그대로다. |
| DQ-08 선발 관리 | 같은 선택을 수행하는 이름 없는 아이콘 버튼과 행 버튼이 공존했고, 빠른 중복 실행으로 2POST가 발생했다. 좁은 화면의 이름도 한두 글자만 남았다. | 선택은 이름·`aria-pressed`를 가진 행 하나로 통합했다. 아이콘은 비활성 장식으로 두되 그 영역도 동일한 행을 누르게 했다. 공개 List 옵션으로 도구막대 조작 영역을 확보하고, 실행 중 fieldset 비활성·복구·포커스 복귀를 적용했다. 20rem 미만의 관리 목록은 이름을 첫 줄, 포지션·상태를 다음 줄로 정리했다. **충족**: 8조건에서 이름·상태·11개 선택 대상을 구별할 수 있고, 2번 실행은 1POST이며 실패 후 선택과 초점이 남는다. |
| DQ-11 편성 정보 | 320px뿐 아니라 2열이 시작되는 640px에서도 `희망 외`가 잘렸다. 교환 중에는 존재하지 않는 해제 버튼의 열이 공간을 차지했다. | MMR·상태만 자연스럽게 줄바꿈하고, 교환/읽기전용에는 빈 해제 열을 제거했다. 행 높이·글자 크기·데이터 의미는 유지했다. **충족**: 320/640px 양 테마의 교환·읽기전용 8조건에서 이름과 수치·`희망 외`가 보이며, 같은 선수 재선택과 본인 해제도 유지된다. |

비교의 대표 근거는 [선택 맥락 이전](before/manual-selection-context-mobile.png)과 [선택 맥락 이후](after/manual-selected-primary-mobile.png), [모집 요약 이전](before/scrim-primary-mobile.png)과 [모집 요약 이후](after/scrim-primary-mobile.png), [관리 이름 이전](before/manager-primary-narrow.png)과 [관리 이름 이후](after/manager-primary-narrow.png), [MMR 이전](before/manual-mmr-dark-narrow.png)과 [MMR 이후](after/manual-mmr-swap-dark-320.png)다. 320px 관리 도구막대는 조작 영역과 읽을 수 있는 이름을 보존하도록 여러 줄이 된다. 가로로 압축해 이름을 다시 잃게 하는 선택은 하지 않았다.

## 적용한 Impeccable 기능과 구현

- **layout**: 관리자 과업 순서와 320px 관리 행의 읽기 순서를 정리했다. DOM·시각·키보드 순서를 일치시켰다.
- **adapt**: 선택 맥락 sticky, 44px native 버튼, 관리 목록의 container query, 교환 중 불필요한 열 제거로 320/390/640/768px에서 과업을 유지했다.
- **harden**: 실행 전후 중복 요청 가드와 `finally` 복구를 적용했다. 실패 시 선택·입력을 유지하고 상태와 초점을 복구했다. 단일 확인 호스트의 기존 중복 보호는 재사용했다.
- **polish**: 기존 작은 글자를 더 줄이지 않고 이름·MMR·상태의 여유를 되돌렸다. 테마와 기존 강조색의 의미를 유지했다.
- **distill / clarify**의 판단도 반영했다. 같은 선택을 하는 버튼과 설명을 새로 만들지 않고, 기존 선택 안내와 행 하나로 조작을 모았다. 이번 범위에는 새로운 장식·색상 규칙·애니메이션을 추가할 필요가 없었다.

변경 파일은 다음 네 개다.

- [ManualFormationBoard.svelte](../../../../apps/web/src/lib/components/teams/ManualFormationBoard.svelte): 선택 안내 높이를 공식 `bind:clientHeight`로 읽고 기존 헤더 높이 아래에서 고정한다. 버튼의 scroll margin은 기존 전역 scroll padding과 합쳐져 키보드 초점을 가리지 않는다. `overflow-hidden`은 새 scroll container를 만들지 않는 `overflow-clip`으로 바꿨다.
- [FormationTeamCard.svelte](../../../../apps/web/src/lib/components/teams/FormationTeamCard.svelte): 기존 STDF 해제 버튼의 44px 조작 영역, MMR·상태 줄바꿈, 실제 해제 조작이 있을 때만 세 번째 열을 둔다.
- [모집 요약 +page.svelte](../../../../apps/web/src/routes/g/[guildId]/scrims/[scrimId]/+page.svelte): 같은 참가자 구성 snippet을 역할별로 한 번만 렌더링한다.
- [ParticipantBoard.svelte](../../../../apps/web/src/lib/components/scrims/ParticipantBoard.svelte): STDF List 공개 옵션을 먼저 쓰고, 이 관리 목록에 한정한 attachment로 중복 아이콘 버튼을 접근성 트리·키보드·조작에서 제외한다. 원래 속성 복구·observer 정리를 포함한다. 공개 API로 해결되지 않은 부분만 좁게 보완했다.

Modern Web Guidance의 `css-layout`에서 확인한 “Use overflow: clip to clip content without establishing a scroll container”를 선택 안내의 sticky 제약 해결에 적용했다. `form-factor-adaptation`의 “at least 44×44 on touch screens”, “Use container queries instead of viewport-width media queries for component layout”를 실제 버튼과 관리 목록에 적용했다. [Svelte 공식 dimensions 문서](https://svelte.dev/docs/svelte/bind#Dimensions)와 [snippet 문서](https://svelte.dev/docs/svelte/snippet)를 확인했고, 설치된 공식 Svelte compiler로 파일을 검사했다. 설치 환경에서 공식 Svelte MCP 도구는 발견되지 않았다.

## 검증과 복원

[validation.json](validation.json)에 조건별 측정값·동작·복원 결과를, [proofs.json](proofs.json)에 이미지 경로·크기·SHA256·실제 이미지 읽기 여부와 소스 해시를 기록했다. 최종 after 62장과 before 12장을 모두 실제로 읽었다. before의 기본 8장은 `897eddf` 재검토 화면 복사본이며, 나머지는 각 선택 맥락·MMR·관리 문제의 수정 직전 상태다. 중간 실험 이미지는 최종 after 증거에서 제외했다.

- 수동 기본 12조건과 선택 12조건: 1440×1000, 390×844, 768×1000, 640×844, 320×844, 720×500 × primary/dark. 선택 안내는 평상시 53px, 좁은 320px에서 69px이며, 상단을 지나면 y64에 고정된다. 취소는 한 개이고 44px 높이다.
- 모집 요약 10조건: 1440/390/768/320/720 × 양 테마. 참가자 패널 한 개, 역할에 맞는 과업 순서, 페이지 가로 넘침·이름 없는 버튼·중복 ID 없음. 높이 500px에서는 정상 문서 스크롤로 관리에 접근한다.
- 관리 8조건: 1440/390/320/640 × 양 테마. 11개 행에 정확한 이름·`aria-pressed`, 11개 중복 아이콘은 inert, 실제 조작 버튼은 모두 최소 44px. Enter·Space·체크 아이콘 영역 클릭, 전체 선택, 완료 후 보기 복귀, 재진입 시 선택 초기화를 확인했다.
- 제외를 같은 tick 두 번 실행해도 확인창은 한 개다. 취소 시 선택이 남는다. 대기 처리를 두 번 실행한 실패 조건은 각 1POST이며, 처리 중 조작 비활성, 오류 후 선택 유지·busy 해제·포커스 복귀를 확인했다.
- 비관리자 신청 390/1440px, 모집 정원 완료 390px, 종료 상태 dark390px에서 권한과 기존 신청 흐름을 확인했다. 신청창은 하나이며 취소로 닫힌다.
- 실제 Chromium 터치 이벤트로 선택→배치(7/10)→44px 해제(6/10)를 실행했다. 풀의 세로 스와이프는 내부 스크롤 0→50만 일으키고 참가자를 선택하지 않는다.
- 수동 이동 실패는 primary390/dark1440 두 조건에서 요청을 중단해 재현했다. 빠른 두 번 실행은 각 1POST, 낙관 반영은 롤백되고 미배정 4명과 다음 선택·Escape가 복구된다. 정착된 오류 토스트도 실제로 읽었다.
- 180자 한글·영문 이름을 브라우저 GET 응답에만 삽입한 320×844/720×500 양 테마에서 선택 상태·취소와 작업판이 유지된다. 긴 이름은 시각적으로 생략하며 전체 이름은 DOM에 남는다.
- 320/640px × 양 테마 × 교환/읽기전용 8조건에서 이름·MMR·희망 외의 실제 박스를 측정했다. 같은 미배정 선수 및 같은 배정 선수 재선택으로 선택 해제, 본인 선택의 해제 버튼 하나, 읽기전용의 해제 버튼 없음도 확인했다.

목 데이터에 실제로 저장한 동작은 미배정 강감찬의 빈자리 배치와 배정 해제 두 번이다. 원본 10자리의 참가자·MMR 텍스트 스냅샷과 최종 스냅샷이 정확히 같고, 최종 배치는 **6/10**, 미배정은 **4명**이다. 실패 검증 요청은 중단했으며 그 외 실제 참가자 상태를 바꾸지 않았다.

소유 4파일의 공식 Svelte compiler 경고는 0개이고 Prettier 검사를 통과했다. root가 최종 Svelte check 0 errors/0 warnings, web production build, browser 7테스트 통과를 별도로 보고했다. 전체 검사를 이 에이전트가 중복 실행했다고 기록하지 않는다.

## 검증 한계

일반 조건과 최종 동작 검증에서 앱 JS 예외는 0개다. 의도적으로 중단한 요청의 네트워크 오류와, 긴 이름을 넣기 위해 응답을 교체했을 때 Chromium 로컬 네트워크 정책이 개발용 Vite HMR WebSocket을 차단한 콘솔 오류는 별도로 구분한다. 이를 실제 앱 오류가 없다는 주장에 섞지 않았다. 비밀 토큰·원시 HMR URL은 증거에 넣지 않았다.

실제 모바일 기기, Safari, 스크린리더, 실서비스 인증·외부 API는 이번 환경의 검증 범위 밖이다. 터치는 Chromium CDP 합성 이벤트이며, 720×500은 확대 상당의 유효 CSS 뷰포트 확인이다. 이번에 정한 핵심 완료 조건은 충족했고, 취향 변경이나 추가 화면 범위는 더 넓히지 않는다.
