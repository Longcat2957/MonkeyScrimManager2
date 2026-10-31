// 이미지가 없는 사람을 이름 첫 글자와 이름에서 정한 색으로 구분한다. 같은 이름은 항상 같은 색이다.
const HUES = [12, 38, 95, 150, 178, 205, 232, 265, 300, 335];

function hue(name: string) {
	let hash = 0;
	for (const char of name) hash = (hash * 31 + char.codePointAt(0)!) | 0;
	return HUES[Math.abs(hash) % HUES.length]!;
}

export function avatarColor(name: string) {
	return `hsl(${hue(name)} 55% 46%)`;
}

/**
 * 이름 첫 글자 원형 이미지를 data URL로 만든다. STDF AvatarGroup은 이미지가 있어야 항목을 구분하므로
 * 사진이 없는 사람에게 쓴다. key를 넣어 이름이 같은 두 사람도 다른 URL이 되게 한다.
 */
export function initialAvatarUrl(name: string, key: string) {
	const initial = [...name][0] ?? '?';
	const svg =
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><!--${key.replace(/-->/g, '')}-->` +
		`<rect width="40" height="40" fill="${avatarColor(name)}"/>` +
		`<text x="20" y="21" fill="#fff" font-family="sans-serif" font-size="18" font-weight="600" ` +
		`text-anchor="middle" dominant-baseline="middle">${initial.replace(/[<&>]/g, '')}</text></svg>`;
	return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
