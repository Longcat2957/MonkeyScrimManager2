/*
 * 화면이 데이터를 얻는 유일한 진입점.
 * 어댑터가 바뀌어도 라우트·컴포넌트는 이 파일의 함수 시그니처만 의존한다.
 */
export * from './types.ts';
export {
	getViewer,
	getGuildContext,
	getGuildHome,
	listScrims,
	listMatches,
	createScrim,
	getScrimDetail,
	getScrimContext,
	closeRecruitment,
	registerSelf,
	withdrawRegistration,
	setRegistrationStatus,
	getMatchDetail,
	getPlayerProfile,
	getGuildStats,
	getGuildAdmin,
	getViewerProfile,
	linkRiotAccount,
	unlinkRiotAccount,
	savePrivacy,
	saveGuildSettings,
	setMemberRole
} from './adapter.mocks.ts';
export type { Scenario } from '#lib/mocks/simulate.ts';
