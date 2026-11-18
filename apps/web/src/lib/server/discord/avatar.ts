import { isDiscordId } from './client.ts';

export function discordAvatarUrl(userId: string, avatarHash: string | null): string | null {
    if (!isDiscordId(userId)) return null;
    if (avatarHash) return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.webp?size=128`;
    // 현재 Discord 사용자명 체계에서는 snowflake의 시각 비트로 기본 아바타 색을 정한다.
    return `https://cdn.discordapp.com/embed/avatars/${(BigInt(userId) >> 22n) % 6n}.png`;
}
