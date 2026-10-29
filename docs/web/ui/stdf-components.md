# STDF 적용 근거와 컴포넌트 선택

확인일: 2026-10-29. 대상: 이 저장소에 설치된 **`stdf@3.0.0`**.

[공통 UI 계획](../ui-plan.md)의 구현 기반을 정리한다. 공식 사이트의 최신 화면이 아니라 설치된 버전의 계약을 기준으로 한다.
`apps/web/package.json`의 범위는 `^3.0.0`이므로 향후 의존성 변경 때 같은 이름의 동작도 다시 확인한다.
이번 작업은 라이브러리 교체·업그레이드·STDF 수정 작업을 포함하지 않는다.

## 1. 확인한 자료

- [STDF 공식 사이트](https://stdf.dev/)와 [공식 저장소](https://github.com/any-tdf/any-tdf/tree/main/packages/stdf).
- STDF 스킬의 컴포넌트 색인·선택한 컴포넌트 상세 문서, 국제화·테마 문서. 스킬 문서 스냅샷도 3.0.0이다.
- 로컬 `apps/web/node_modules/stdf/package.json`, `dist/index.js`, `dist/types`, `dist/components`의 선언과 실제 Svelte 소스.
- `ConfigProvider`는 별도 선언과 국제화 문서를 확인했다. `stdf/lang`의 한국어 설정은 `ko_KR`다.

아래 옵션은 검증된 부분만 제시한다. HTML 속성이 모든 STDF 컴포넌트에 그대로 전달된다고 가정하지 않는다.
표에 없는 옵션은 필요한 시점에 설치 선언·소스로 확인한다.

## 2. 우선 사용할 STDF 구성

| 구성요소 | 배치에서의 역할 | 확인한 계약·사용 경계 |
| --- | --- | --- |
| `ConfigProvider` | 루트의 한국어 기본 문구 | `locale`과 `children` 사용. 테마·화면 모드는 이 컴포넌트의 옵션이 아님 |
| `NavBar` | 세 종류 헤더의 정렬 틀 | `leftChild`, `titleChild`, `rightChild` 지원. 브랜드·서버 선택·실제 링크 메뉴를 각 영역에 조립 |
| `Button` | 제출·메뉴 열기·설정 변경·복구 | `fill`, `size`, `state`, `disabled`, `loading`, `type` 지원. 행동 이름은 실제 내용에 제공 |
| `Input` | 제목·검색어·Riot ID 같은 텍스트 | `title`, `value`, `state`, `tip`, `onchange` 등 지원. 실제 label이 입력을 감쌈. 파일·날짜 입력 타입은 없음 |
| `Form` | 지원하는 입력들의 값 관리·배치 | `form`, `onchange`, `onsubmit`, `submitText`, `resetText`. 필수 표시만으로 검증하지 않음. 이미 외부 제출이 있으면 자체 제출을 추가하지 않음 |
| `Popup` | 서비스의 입력·선택 패널 기반 | `visible`, `position`, `size`, `maskClosable`, `children`, `onclose`. 포커스 등은 공통 `TaskDialog` 책임 |
| `Dialog` | 권한 변경·연결 해제 같은 단순 확인 | `contentChild`, 주/보조 버튼과 콜백 지원. 확인 자체가 필요한 작업에만 사용 |
| `Card` | 독립 편집 또는 팀·대진 같은 업무 단위 | `header`, `children`, `footer`, `shadow`, 간격·경계 옵션 사용. 모든 문장·수치를 카드화하지 않음 |
| `Tabs` / `Tab` | 같은 화면의 Game 결과 선택 | `active`, `Tab.labels`, `overflow`, `showNum`, 선택 콜백 지원. 실제 라우트 내비게이션은 맡기지 않음 |
| `Pagination` | 목록 끝의 페이지 탐색 | `total`, `pageSize`, `current`, `maxShowPage`, `onchange`. 이전/다음 콜백도 onchange를 일으키므로 같은 조회 중복 금지 |
| `Accordion` | 경매 구매·정정 이력 등 부가 정보 | `items`, `activeIndex`, `multiple`, `children` 지원. 현재 편성·필수 입력을 접어 숨기지 않음 |
| `Skeleton` | 최초 조회 중 콘텐츠 형태 유지 | 행·문단·이미지 영역 크기를 표현. 실제 값과 동시에 빈 데이터 안내를 만들지 않음 |
| `Loading` | 조회·저장·전송 중 표시 | 단색 계열과 적절한 크기 사용. 측정하지 않은 완료 비율로 바꾸지 않음 |
| `Tag` | 필요한 상태의 짧은 표시 | 상태 의미에 맞는 `state`, `text` 사용. 같은 상태 문장 옆에 중복 배지를 추가하지 않음 |

`Card`는 `onclick`을 주면 버튼이 된다. 내부에 입력·링크·버튼이 있는 업무 컨테이너는 클릭 가능한 Card로 만들지 않는다.
Button의 기본 크기는 웹 헤더에 바로 맞는 작은 크기가 아니므로 영역별 공개 크기·간격 옵션을 선택한다.
로딩 시 비활성화는 암묵적 기본값에만 기대지 않고 작업 상태로 명시한다.

## 3. HTML 기본 요소를 사용하는 한정 예외

STDF가 제공하는 버튼·입력·팝업·카드·상태 표현을 우선 사용한다.
아래 예외는 새로운 커스텀 디자인 시스템을 만드는 이유가 아니라, 설치 버전이 제공하지 못하는 의미·조작을 보존하기 위한 선택이다.
색상·간격·초점 표현은 기존 전역 테마와 통일한다.

| 필요한 UI | 확인한 제약 | 이번 계획의 선택 |
| --- | --- | --- |
| 라우트 내비게이션·내전/Match 링크 목록 | `Tab`과 `List` 항목은 button이며 링크용 href 계약이 없음. 특히 `List.itemChild`도 button 내부 | 의미 있는 `nav` 또는 `ul/li`와 단일 `a`. 링크 내부에 버튼을 넣지 않음 |
| 프로필 사진·참가자 정적 식별 | `Avatar`가 항상 button이고 이미지 alt도 정적 텍스트 표시용 옵션과 다름 | 정적 `img`·텍스트. 허용된 전적 이동은 전체 식별 영역의 링크 하나 |
| 표 형태의 성적·정책 데이터 | 설치 export에 `Table` 없음 | caption·열/행 제목을 갖춘 HTML table. 모바일 핵심 열과 상세 분리 |
| ROFL 선택 | `Input`은 `type=file`을 지원하지 않고 전용 FileUpload export 없음 | 라벨을 연결한 native file input 하나. 파일 선택 버튼·드롭존을 따로 복제하지 않음 |
| 계정·팀·채널·필터의 단일 선택 | `Picker`·`TimePicker`의 내부 `ScrollRadio`는 스크롤 div 기반이며 항목 키보드 선택·선택 상태 연결이 없음 | native select. 단순 선택을 위해 별도 휠 패널이나 중첩 Popup을 만들지 않음 |
| 방식·권한 관련 선택값 | `RadioItem`·`CheckboxItem`·`Switch`는 button 기반이며 checked 역할·상태와 그룹 라벨을 자동 보장하지 않음 | 라벨·fieldset/legend를 갖춘 native radio/checkbox. 명시적인 저장을 별도로 제공 |
| 인원·BO와 예정 시각 | `Stepper`는 증감 버튼·표시값이며 직접 숫자 편집과 입력 라벨 계약이 없고, `TimePicker`는 위 선택 제약 존재 | 직접 입력 가능한 native number·datetime-local. 값 범위·시간대·서버 검증은 업무 규칙 적용. 포인트는 라벨 있는 STDF Input의 숫자 모드로 직접 입력하고 값을 검증 |
| 문서·설명·지표의 의미 구조 | 별도 컴포넌트가 필요 없는 콘텐츠 | 제목·문단·정의 목록·표준 링크 사용. 외형만을 위한 래퍼를 만들지 않음 |

이 예외들은 해당 컨트롤에만 적용한다. 향후 STDF가 요구 동작을 공개 API로 지원하면 그 부분만 다시 검토한다.
현재 부족한 동작을 있다고 가정하거나, 내부 DOM을 임의 수정하는 패치를 계획의 전제로 삼지 않는다.

## 4. 상호작용에서 직접 보완할 범위

| 대상 | 확인한 사실 | 서비스에서 보장할 내용 |
| --- | --- | --- |
| Popup·Dialog | Popup 소스에 전체 포커스 제한·복귀·Escape·dialog 의미 관리가 없음 | 이름 있는 대화상자, 처음 포커스, 배경 조작 차단, 키보드 순환, 닫기 후 복귀. 서비스 입력은 TaskDialog에서 공통 처리 |
| Tabs·Tab | native button 클릭은 가능하지만 tablist/tab 역할·aria-selected·방향키 이동이 없음 | Game 선택을 이름 있는 버튼 묶음으로 제공하고 활성 선택을 텍스트로 구분. 완성된 ARIA 탭이라고 부르지 않음 |
| Form | required는 표시이며 값 검증·필드 오류 연결을 대신하지 않음 | 입력 검증, 서버 오류, 첫 오류 초점, 저장 진행·충돌. native 선택과 섞을 때 제출 위치 한 곳 유지 |
| Input | 숫자 계열도 내부에서 텍스트로 다루며 값은 문자열 | 숫자 저장 타입·범위 검증은 서비스 책임. 불필요한 clear 아이콘은 켜지 않음 |
| Accordion | 공개 확장 API가 있지만 제목 버튼에 확장 의미 연결을 자동 보장하지 않음 | 접힘/펼침 상태와 읽기 순서 검토. 의미를 보완할 공개 API가 부족하면 해당 이력만 native details/summary 사용 |
| Pagination | total은 표시하지 않으며 일부 버튼 이름은 소스에 고정 | 필요한 조회 범위·현재 페이지를 주변 문맥으로 알림. 보조 이름·선택 상태의 실제 읽기를 구현 단계에서 확인 |

STDF `Alert`는 fixed 알림이며 기본 자동 닫힘이 있다. 지속되는 업로드 오류·공개 범위 저장 실패의 본문 UI로 사용하지 않는다.
`Modal`은 단순 확인 중심이므로 서비스 입력 폼은 `TaskDialog(Popup)`로 통일하고, 단순 확인은 `Dialog`를 사용한다.
기능형 Toast/Alert를 현재 기본 흐름에 넣지 않으므로 루트에 `Feedback`를 무조건 추가하지 않는다.
향후 기능형 API를 채택할 때만 한국어 설정 안에 Feedback 하나를 배치한다.

## 5. 문서와 설치 소스의 차이

| 항목 | 확인 결과 | 계획에서의 처리 |
| --- | --- | --- |
| Button `disabledLoading` | 스킬 API 표의 기본값 false와 설치 소스 기본값 true가 다름 | 처리 중 중복 제출을 명시적으로 제한하고 기본값에 기대지 않음 |
| Skeleton 간격 | 스킬 API 표는 `padding`, 설치 소스는 `space`를 사용 | 계획은 형태·크기만 지정. 실제 옵션은 설치 선언에 맞춤 |
| Stepper `onchange` | 문서의 객체 형태 설명과 설치 타입의 숫자 콜백이 다름 | 이번 계획의 직접 숫자 입력에는 사용하지 않음 |
| List의 `clickable` | 가이드에 있지만 공개 props 표·설치 계약에 동일 옵션 없음 | `clickable=false`로 링크 감싸기를 해결한다고 가정하지 않음 |

### `/me` 구현에서 확인한 보완

- `ModalBoundary`의 native dialog가 Popup·Dialog의 배경 조작 차단·Escape·포커스 복귀를 담당한다. STDF Mask는 숨겨 이름 없는 배경 버튼을 추가하지 않는다.
- 중앙 Popup의 `size`는 높이를 조절하며 폭 옵션은 없다. 공통 모달 안의 직계 Popup 배치 요소에만 최대 폭과 세로 스크롤 제한을 적용한다. STDF 표면·입력·버튼은 그대로 사용하며 설치 버전 변경 시 이 구조를 다시 확인한다.
- 설치된 Button의 `md`·`sm`은 `tdf-button-md`·`tdf-button-sm` 클래스를 출력하지만 배포 CSS에 해당 여백 정의가 없다. 공개 `injClass`로 공통 `app-button`의 가로 여백·최소 클릭 높이·포커스를 연결한다.

## 6. 구현 전 확인 목록

1. 설치 버전과 사용 컴포넌트의 공개 API를 다시 대조한다. 개발자 로컬의 다른 STDF 버전 예제를 그대로 가져오지 않는다.
2. 한국어 기본 문구와 기존 테마를 루트에 연결하고 컴포넌트마다 언어·색상을 반복 지정하지 않는다.
3. 키보드·스크린리더·작은 화면에서 선택·입력·패널 닫기까지 완료한다. 단순히 버튼이 클릭된다는 이유로 검증을 끝내지 않는다.
4. 파일 선택·라벨·반응형 표·링크 예외는 범위를 유지하며 STDF로 해결할 수 있는 부품까지 자체 구현으로 확장하지 않는다.
5. 실제 화면에서 발견된 제약만 보완한다. 이 문서가 패키지 전체 교체나 무조건적인 공통 래퍼 작성을 요구하지 않는다.
