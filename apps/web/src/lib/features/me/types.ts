export interface MeProfile {
	displayName: string;
	username: string;
	avatarUrl: string | null;
}

export interface RiotAccount {
	id: string;
	gameName: string;
	tagLine: string;
	platform: string;
}

export interface PrivacySettings {
	publicProfileEnabled: boolean;
	showRiotIds: boolean;
}

export interface MeData {
	profile: MeProfile;
	accounts: RiotAccount[];
	privacy: PrivacySettings;
}

export type MeScenario =
	| 'ready'
	| 'empty'
	| 'load-error'
	| 'save-error'
	| 'lookup-error'
	| 'link-error'
	| 'unlink-error'
	| 'signed-out';
