export type PrivacyPreferences = { publicProfile: boolean; publicRiotIds: boolean };

export type MyPrivacy = PrivacyPreferences & { withdrawalBlock: string | null };
