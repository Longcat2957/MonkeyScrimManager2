import type { PrivacySettingsView, RiotAccountView } from '#lib/data/types.ts';

/*
 * 계정 연결·공개 범위 목 저장소.
 * 소유권 확인은 실제 Riot API 연동 시 서버가 판단하므로 여기서는 상태만 재현한다.
 */

const accounts: RiotAccountView[] = [
	{ id: 'riot-account-01', gameName: '참가자01', tagLine: 'KR1', platform: 'KR', verified: true }
];

const privacy: PrivacySettingsView = {
	publicProfile: true,
	showRiotIds: true
};

export function listAccounts(): RiotAccountView[] {
	return accounts;
}

export function getPrivacy(): PrivacySettingsView {
	return { ...privacy };
}

export function addAccount(gameName: string, tagLine: string): RiotAccountView | null {
	// 이미 연결된 Riot ID는 추가하지 않고 기존 연결 충돌로 처리한다.
	if (accounts.some((account) => account.gameName === gameName && account.tagLine === tagLine)) return null;
	const account: RiotAccountView = {
		id: `riot-account-${accounts.length + 1}`,
		gameName,
		tagLine,
		platform: 'KR',
		verified: false
	};
	accounts.push(account);
	return account;
}

export function removeAccount(accountId: string): boolean {
	const index = accounts.findIndex((account) => account.id === accountId);
	if (index === -1) return false;
	accounts.splice(index, 1);
	return true;
}

export function updatePrivacy(next: PrivacySettingsView): PrivacySettingsView {
	privacy.publicProfile = next.publicProfile;
	privacy.showRiotIds = next.showRiotIds;
	return getPrivacy();
}
