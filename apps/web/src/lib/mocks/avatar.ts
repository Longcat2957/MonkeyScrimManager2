export function mockAvatarUrl(userId: string | null | undefined): string | null {
    if (!userId) return null;
    const index = Array.from(userId).reduce((sum, char) => sum + char.charCodeAt(0), 0) % 6;
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}
