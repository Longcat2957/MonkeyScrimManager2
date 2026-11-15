import type { MyPrivacy, PrivacyPreferences } from '#lib/features/me/privacy.ts';
import { DomainError } from '#lib/server/errors.ts';
import { clearMockRiotAccounts, listMockRiotAccounts } from './me.ts';
import { mockUser } from './session.ts';
import { clearMockChampionPreferences } from './champions.ts';

let preferences: PrivacyPreferences = { publicProfile: true, publicRiotIds: true };

export function getMockPrivacy(): MyPrivacy {
    return {
        ...preferences,
        withdrawalBlock: mockUser.isServiceAdmin
            ? '서비스 운영자 권한을 먼저 해제해 주세요'
            : listMockRiotAccounts(mockUser.userId).some((account) => account.inActiveScrim)
              ? '참가 중인 내전이 있어요. 신청을 철회하거나 내전이 종료된 뒤 다시 시도해 주세요'
              : null
    };
}

export function setMockPrivacy(value: PrivacyPreferences) {
    preferences = { ...value };
}

export function withdrawMockAccount(confirmed: boolean) {
    if (!confirmed) throw new DomainError('INVALID_INPUT', '서비스 탈퇴를 확인해 주세요');
    const reason = getMockPrivacy().withdrawalBlock;
    if (reason) throw new DomainError('CONFLICT', reason);
    clearMockRiotAccounts(mockUser.userId);
    clearMockChampionPreferences();
    preferences = { publicProfile: false, publicRiotIds: false };
}
