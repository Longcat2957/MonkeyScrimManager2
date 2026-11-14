# 실제 전적 UI의 추가 시각 증거

2026-11-14, root의 최종 production build와 기존 격리 HTTP fixture로 수동 상세·실제 경매 프로필의 **8장**, 실제 마지막 세트 취소 후 무기록 프로필의 **2장**을 촬영했다. 모든 PNG를 `view_image`로 직접 읽고 [feature-visual.json](feature-visual.json)에 전체 SHA-256·실제 URL·뷰포트·테마·이미지 크기를 기록했다.

유지하는 제품 source와 [기존 회귀 테스트](../../../apps/web/tests/browser/formation-records.test.ts)는 변경하지 않았다. 임시 capture 계측을 해당 테스트의 복사본에 넣어 한 fixture에서 실행했으며 **1/1 통과**했다. 브라우저·격리 앱·전용 DB schema 정리와 임시 계측 파일·runner 삭제까지 완료했다. capture 과정에서 build를 다시 실행하지 않았다.

## 확인한 화면

| 상태                                 | 1440×1000 라이트                                         | 1440×1000 다크                                        | 390×844 라이트                                                    | 390×844 다크                                                   |
| ------------------------------------ | -------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------- |
| 실제 ROFL 1게임의 수동 상세          | [PNG](after/feature-manual-records-primary-desktop.png)  | [PNG](after/feature-manual-records-dark-desktop.png)  | [PNG](after/feature-manual-records-primary-mobile.png)            | [PNG](after/feature-manual-records-dark-mobile.png)            |
| 같은 시즌 다른 경매의 후보 상세      | [PNG](after/feature-auction-records-primary-desktop.png) | [PNG](after/feature-auction-records-dark-desktop.png) | [PNG](after/feature-auction-records-primary-mobile.png)           | [PNG](after/feature-auction-records-dark-mobile.png)           |
| 실제 취소 후 같은 후보의 무기록 상세 | —                                                        | —                                                     | [PNG](after/feature-auction-zero-after-revert-primary-mobile.png) | [PNG](after/feature-auction-zero-after-revert-dark-mobile.png) |

모두 full-page PNG다. 경매의 내부 상세 스크롤은 `게임 기록`과 미확인 시각이 보이는 위치로 이동했다. 390px는 에뮬레이션 뷰포트이며 실기기·터치 제스처 검증과 구분한다.

## 관찰과 상태 검증

- 수동 상세는 데스크톱에서 두 팀과 시너지·맞대결을 나란히 비교한다. 모바일에서는 각 팀 다음에 그 팀의 시너지를 읽고 마지막에 다섯 라인 상대 전적을 확인한다. 실제 업로드 결과와 같은 1팀 `1승 0패`, 2팀 `0승 1패`, 다섯 라인 `1-0`이 두 테마에서 보였다.
- 실제 후보 `ReplayPlayer0`는 저장된 Ahri·1게임·1승·주력 탑을 표시했다. 희망 위치가 없는 fixture에서 이를 희망 탑으로 바꾸지 않았다. 실제 시각은 `게임 기록`·`시각 미확인`으로 남았다.
- 모바일 라인별 MMR은 4+1로 줄을 바꾸며 모든 포지션·MMR·게임 수를 유지했다. 카드나 숫자의 겹침·잘림과 문서 가로 넘침이 없었다.
- 관리자 화면의 `마지막 세트 취소`를 누르고 실제 확인창의 확인 버튼으로 기존 `revertResult` action을 실행했다. Game이 `cancelled`가 된 뒤 같은 후보를 다시 열자 무기록 안내가 한 번만 표시됐다. 다섯 라인 MMR은 모두 `1,500`, 게임 수는 0이었다. 주력 위치를 더는 알 수 없으므로 `포지션 미확인`·대표 `MMR -`를 유지했고, 없는 챔피언·게임 기록·선호 챔피언·Riot 전적 영역을 만들지 않았다.
- 새 실제 데이터 UI에서 추가 레이아웃 결함을 관찰하지 않았다. 10개 상태 모두 문서 가로 넘침이 없었으며 앱 JavaScript·예기치 않은 console 오류는 0개였다.

## 검증 한계

기존 브라우저 fixture는 외부 요청을 차단한다. 따라서 Google Fonts의 브랜드·본문 폰트는 fallback이며, Data Dragon의 장식 챔피언 이미지는 전송 실패 그림으로 보인다. 이를 제품 회귀로 집계하거나 무시 규칙을 추가하지 않았다. 이미지·실서비스 폰트의 로딩 성공을 이 증거로 주장하지 않는다.

정상 파일은 parser 검증을 통과하는 합성 ROFL2이며, 실제 사용자에게서 새로 받은 파일은 아니다. 실서비스 Discord·Riot·OAuth·쓰기, Safari·스크린리더·성능 수치는 이 검증 범위에 없다. 이 단일 시각 확인은 root의 기존 전체 리뷰를 보완하며 독립적인 전체 critique/audit 재실행을 주장하지 않는다.
