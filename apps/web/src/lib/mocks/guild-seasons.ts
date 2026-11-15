import type { GuildSeasonOverview, RotateGuildSeasonInput } from '#lib/features/seasons.ts';
import { DomainError } from '#lib/server/errors.ts';

// 개발 샘플에는 실제 시즌 귀속이 없으므로 가상 현재 시즌이나 종료 이력을 만들지 않는다.
export function getMockGuildSeasons(_guildId: string): GuildSeasonOverview {
    return { current: null, completed: [] };
}

export function rotateMockGuildSeason(_guildId: string, _input: RotateGuildSeasonInput): never {
    throw new DomainError('CONFLICT', '진행 중인 시즌이 없어요. 서버 초기 설정을 확인해 주세요');
}
