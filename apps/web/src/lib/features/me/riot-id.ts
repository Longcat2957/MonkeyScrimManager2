// Riot ID는 "이름#태그" 형식이다. 이름 3~16자, 태그 3~5자의 영문·숫자·한글.
const RIOT_ID = /^(.{3,16})#([\p{L}\p{N}]{3,5})$/u;

export function parseRiotId(input: string) {
	const match = RIOT_ID.exec(input.trim());
	if (!match) return null;
	return { gameName: match[1].trim(), tagLine: match[2] };
}

export const RIOT_ID_FORMAT_ERROR = '이름#태그 형식으로 입력해 주세요';
