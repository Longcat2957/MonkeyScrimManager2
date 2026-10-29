import type { MeData, MeScenario, PrivacySettings, RiotAccount } from '#lib/features/me/types.ts';

function createAccount(gameName: string, tagLine: string): RiotAccount {
	const normalizedName = gameName.trim().normalize('NFKC');
	const normalizedTag = tagLine.trim().normalize('NFKC');

	return {
		id: `mock-riot:${encodeURIComponent(normalizedName.toLowerCase())}:${encodeURIComponent(normalizedTag.toLowerCase())}`,
		gameName: normalizedName,
		tagLine: normalizedTag,
		platform: 'KR'
	};
}

const initialData: MeData = {
	profile: {
		displayName: '하루',
		username: 'haru.sample',
		avatarUrl: null
	},
	accounts: [createAccount('달빛원숭이', 'KR1'), createAccount('노을산책', 'KR2')],
	privacy: {
		publicProfileEnabled: false,
		showRiotIds: false
	}
};

export function getMeMockData(scenario: MeScenario): MeData {
	const data = structuredClone(initialData);
	if (scenario === 'empty') data.accounts = [];
	return data;
}

function waitForResponse(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 350));
}

// 요청의 성공·실패만 흉내 내며, 화면 상태 반영은 호출자가 담당한다.
export function createMeMockActions(scenario: MeScenario): {
	lookupAccount: (gameName: string, tagLine: string) => Promise<RiotAccount>;
	linkAccount: (account: RiotAccount) => Promise<void>;
	unlinkAccount: (accountId: string) => Promise<void>;
	savePrivacy: (settings: PrivacySettings) => Promise<PrivacySettings>;
} {
	let pendingFailure: MeScenario | null = scenario;

	function failOnce(failureScenario: MeScenario, message: string): void {
		if (pendingFailure !== failureScenario) return;
		pendingFailure = null;
		throw new Error(message);
	}

	return {
		async lookupAccount(gameName, tagLine) {
			const account = createAccount(gameName, tagLine);
			await waitForResponse();
			if (!account.gameName || !account.tagLine) {
				throw new Error('Riot ID의 이름과 태그를 입력해 주세요.');
			}
			failOnce('lookup-error', '계정을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
			return account;
		},
		async linkAccount(_account) {
			await waitForResponse();
			failOnce('link-error', '계정을 연결하지 못했어요. 다시 시도해 주세요.');
		},
		async unlinkAccount(_accountId) {
			await waitForResponse();
			failOnce('unlink-error', '연결을 해제하지 못했어요. 다시 시도해 주세요.');
		},
		async savePrivacy(settings) {
			const submittedSettings = { ...settings };
			await waitForResponse();
			failOnce('save-error', '공개 범위를 저장하지 못했어요. 다시 시도해 주세요.');
			return submittedSettings;
		}
	};
}
