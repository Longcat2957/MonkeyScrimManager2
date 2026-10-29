# 조사 기록

이 디렉터리의 두 문서는 [디자인 재작성 계획](../README.md)을 세운 근거 자료다. 계획 문서와 달리 **조사 원문**이므로
일부 경로는 저장소 밖(설치된 패키지, 이전 프로젝트 체크아웃)을 가리킨다. 계획이나 사양으로 사용하지 않는다.

| 문서 | 범위 | 경로 표기 |
| --- | --- | --- |
| [stdf-inventory.md](stdf-inventory.md) | 설치판 `stdf@3.0.0`(Svelte 5.57.3, Tailwind 4.3.3)의 export·props·기본값·마크업·a11y·테마·i18n·Tailwind 연동 | `S:` = `apps/web/node_modules/stdf`, `C:` = `@any-tdf/common`, `W:` = `apps/web` |
| [msm1-ux-audit.md](msm1-ux-audit.md) | 이전 프로젝트 `MonkeyScrimManager`의 웹앱 라우트·사용자 여정·패턴·문제 15건·도메인 계약 | 저장소 루트 기준 상대 경로 |

재검증이 필요한 시점:

- `stdf` 버전을 바꿀 때(현재 `package.json`은 `^3.0.0` → 정확한 버전 고정 권고, [delivery.md R2](../delivery.md)).
- MSM1 저장소가 크게 바뀌어 사용자 용어·흐름을 다시 참고할 때.
- 경매·대진 정책이 확정되어 화면 계약을 잠글 때.
