# Final Assessment A — independent design review

Method: isolated Assessment A (/root/design_review). Final detector output was neither read nor run in this context. Assessment B is deliberately separate. Questions skipped: the user explicitly authorized autonomous diagnosis, implementation, and revalidation.

## Design specificity verdict

The interface now reads as an authored League of Legends scrim tool. Team formation slots, per-position MMR, captain budgets, BO series and set results, ROFL recording, and champion art determine the composition. It would take structural changes to reuse these workspaces for an unrelated SaaS product. The restrained Slate controls and Jersey 10 wordmark remain coherent across public information, account pages, game data, and operator tools. Generic metric cards remain in statistics, but player records now distinguish six primary metrics from nine details and use quieter neutral treatment.

The largest original problems are resolved: manual teams stack without clipping on mobile; auction preparation exposes its goal and save/start actions before candidate lists; mobile statistics retain all comparable metrics in a named horizontal scroll region; expired countdowns state that the planned time has passed; player records no longer open with fifteen equally weighted metrics.

## Nielsen heuristic scores

Scores describe observed interfaces, not a certification of all production behavior. All ten apply to this product.

| Heuristic | Score / 4 | Evidence and limit |
| --- | --- | --- |
| 1. Visibility of system status | 3 | Placement count and constraint, selected filters, operation pending states, status check time and offline feedback are explicit. |
| 2. Match with the real world | 4 | Korean league terminology, team slots, captain points, series/set distinction, and ROFL flow match the documented product. |
| 3. User control and freedom | 3 | Escape/cancel, selection cancellation, reset/change method, filter changes, and retry exist; persisted operations appropriately retain confirmations. |
| 4. Consistency and standards | 3 | Shared controls, filters, accordions, overlays and state messages follow one system. The backoffice target correction was measured at44px in all four width/theme cases. |
| 5. Error prevention | 3 | Missing captains/placements and invalid amounts prevent commit; duplicate submission guards and preserved input cover reproduced failures. Mid-request connection loss remains a narrower unverified limit. |
| 6. Recognition rather than recall | 3 | Current task/status/context and available candidates are visible. The longest mobile live-auction workspace still separates current candidate and later team bidding panels by scrolling. |
| 7. Flexibility and efficiency | 3 | Keyboard/native buttons, click/tap placement alongside drag, bid increments, search, filters, sorting and pagination support distinct work styles. |
| 8. Aesthetic and minimalist design | 3 | Clear task hierarchy, bounded lists, progressive disclosure, muted secondary data and retained meaningful game art. Duplicate KPI notes found in A were removed by the parent. |
| 9. Error recognition and recovery | 3 | Field-linked errors, preserved input, failed retry recovery, offline status recovery and distinct 401/403/404/500 guidance were actually reproduced. |
| 10. Help and documentation | 3 | The task-based guide has six direct anchors, ordered steps and accessible FAQ. Policy bodies remain placeholders and need supplied content. |
| **Total** | **31 / 40 — Good** | No remaining observed P0/P1 UI implementation blocker in the reviewed changed workflows. |

## Strengths

1. Operational hierarchy is now practical. Manual formation places count, completion condition and four grouped tools above a bounded pool and responsive teams. Auction preparation places the blocked reason and save/start actions first. Evidence: `/g/devGuild001/scrims/devScrim007/manual`, `/g/devGuild001/scrims/devScrim002/auction`; `ManualFormationBoard.svelte`, `AuctionSetupBoard.svelte`; final-a-manual/auction light+dark desktop+mobile images.
2. Dense data keeps its meaning at small widths. The statistics table retains its columns with a sticky player identifier and explicit scroll instruction; player records show six primary metrics and an accordion for nine others. The match heading joins team identity and series score before selected-set results. Evidence: stats, players/devUser001, matches/devMatch001 and corresponding final-a screenshots.
3. Recovery feedback is attached to the task. Settings and registration preserve entered values across reproduced failures; account empty state names the next responsible person; backoffice handles known offline state without leaving the app; the gallery exercises a real file picker and a failed-then-successful retry. Evidence: forms-validation.json, account-validation.json and their screenshots.

## Priority issues and dispositions

- **[P1 before public launch; supplied content required] Policy destinations contain only a preparation message.** `/terms` and `/privacy` offer no actual policy body. This is observed content incompleteness, not a styling failure or a claim about legal obligations. The owner must supply the approved policy facts; the UI agent should not fabricate them. Suggested function: clarify/document after content is supplied. Completion: both existing destinations contain the approved readable content and retain one h1.
- **[P2, corrected during this assessment] Repeated statistics KPI notes.** `총 게임 → 기록된 게임`, `분당 킬 → 게임 1분당 나온 킬`, `사용한 챔피언 → 이 서버에서 나온 챔피언` restated their labels. Parent changed these three notes to null without changing values. Corrected light and dark screenshots at both widths were captured and actually read. Suggested function: distill/clarify.
- **[P2, corrected and reverified] Backoffice recheck touch target was shorter than the shared 44px control target.** The button uses heightIn=2 without min-h-11 and renders about 38px; the gallery retry already measures 44px in both widths. Parent added the same minimum height; final-a-backoffice captures were actually read and all four cases measured44px. Evidence: `routes/backoffice/+page.svelte`, backoffice desktop/mobile images. Suggested function: adapt/polish. This does not block its operation.

- **[P2, corrected and reverified] Invalid Riot ID lookup did not focus the invalid field.** In the admin account dialog, clicking 조회 with an empty ID correctly adds aria-invalid, describedby and a visible alert, but focus remains on the submit button in all four width/theme cases. The implementation owner now focuses the native input after rendering the client validation error, matching the other forms. All four width/theme cases were rerun, asserted input focus and had their updated screenshots actually read. Evidence: `MemberRiotAccountsDialog.svelte` parseRiotId failure branch; `/tmp/msm2-final-a-admin-output.json`. Suggested function: harden/polish.

A potential future usability study is the mobile live auction: four team bid panels make a long page, so team four is far from the current-candidate card. The current task is operable, each panel is named, and no task failure was reproduced. Do not treat this as a confirmed blocker or impose another structural redesign without operator evidence.

## Cognitive load

- Manual formation presents four toolbar choices and one placement task; secondary synergy and head-to-head information are hidden until requested.
- Auction setup has 20 candidate rows but search and a bounded list make it a single repeated selection task; four team states remain grouped. Live bidding exposes four increments per team rather than undocumented alternate mouse gestures.
- Statistics has six position options, seven sortable metric columns and multiple record rows. These exceed four visible items, but are persistent comparison controls and data groups rather than information the user must memorize. The all-metrics scroll hint removes the previous hidden-data problem.
- Player records reduce the initial metric decision from fifteen peers to six primary values plus one nine-detail control. There is no duplicate recent-game navigation.
- Documentation has six task anchors. Its long content is broken into purposes, ordered steps, and FAQ questions. Development-only shortcut links are not treated as production onboarding options.
- No ungrouped wall of unrelated primary actions was observed. The remaining memory-bridge risk is the long live-auction mobile page described above.

## Emotional journey and personas

- **Jordan, first-time participant:** the home page explains the four-step flow, login remains a clear header action, and an empty Riot-account list identifies the operator as the next step. The policy placeholders are the unresolved trust valley.
- **Alex, scrim operator:** placement count, blocked reasons and save/start readiness are visible before committing. Reset/change method require appropriate confirmation. Native button and keyboard paths support operation without drag. The mobile live-auction length is the strongest candidate for a later real-operator task study.
- **Sam, keyboard/assistive-technology user:** selected controls now expose aria-pressed; FAQ/history/detail accordions expose expanded state and actual panel associations; errors are linked to native fields; overlays have tested focus containment and restoration. Physical screen-reader output, Safari and real mobile devices remain unverified, so the review does not claim full assistive-technology equivalence.

The strongest positive end states are readable recorded match results and the restrained achievement presentation. Error valleys now supply next actions and preserve input where failures were reproduced. No extra celebration or decorative animation is needed to finish this pass.

## Evidence and run boundaries

Live target: http://127.0.0.1:5173. Playwright MCP was used through the working isolated Chromium stdio helper, with fresh pages. Final-a captures cover public4, guild, statistics, manual, auction preparation/completion and player/match at 1440×1000 and 390×844 in light and dark. Account4 was inspected in the immediately preceding frozen batch (16 base plus 13 state screenshots, all actually read). Live-auction state images from the completed workflow batch were also read. No final detector output was consulted. The admin owner authorized readonly review after its first implementation; base/member sheet/Discord settings were captured and all twelve width/theme screenshots actually read. The confirmed invalid-field focus issue was sent back, corrected and reverified before closing Assessment A. The final full 20-page capture reading remains a separate coverage gate; this assessment does not misrepresent it as already complete.

Assessment A complete: final detector output still unread. No new UI source edits were made by this assessment.
