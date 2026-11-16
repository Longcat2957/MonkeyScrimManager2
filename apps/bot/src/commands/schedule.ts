export function scheduleFromKst(value: string | null): string | null {
    if (!value?.trim()) return null;
    const match = /^(\d{4})-(\d{2})-(\d{2}) ([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
    if (!match) throw new Error('예정 시각은 한국 시각으로 2026-11-05 20:00처럼 입력해 주세요.');
    const [, year, month, day, hour, minute] = match;
    const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:00+09:00`);
    if (
        !Number.isFinite(date.getTime()) ||
        new Date(date.getTime() + 9 * 60 * 60_000).toISOString().slice(0, 16) !==
            `${year}-${month}-${day}T${hour}:${minute}`
    ) {
        throw new Error('실제 달력에 있는 날짜를 입력해 주세요.');
    }
    return date.toISOString();
}
