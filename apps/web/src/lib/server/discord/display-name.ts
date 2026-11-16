/** 서버 별명은 해당 서버 안에서만 우선하며 전역 프로필을 덮어쓰지 않는다. */
export function discordDisplayName(
    user: { username: string; globalName: string | null },
    nickname?: string | null
): string {
    return nickname?.trim() || user.globalName?.trim() || user.username;
}
