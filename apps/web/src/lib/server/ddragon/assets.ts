import { RiotError } from '../riot/errors.ts';
import { DATA_DRAGON_ORIGIN, validateVersion } from './client.ts';

const imageDirectories = {
	champion: 'champion', item: 'item', spell: 'spell', 'profile-icon': 'profileicon'
} as const;

/** Pass image.full from the catalog; never construct names from translated display names. */
export function dataDragonImageUrl(version: string, kind: keyof typeof imageDirectories, filename: string): string {
	validateVersion(version);
	if (!Object.hasOwn(imageDirectories, kind) || !/^[A-Za-z0-9_-]{1,128}\.png$/.test(filename)) {
		throw new RiotError('INVALID_ARGUMENT', '이미지 종류 또는 파일명이 올바르지 않습니다.');
	}
	return `${DATA_DRAGON_ORIGIN}/cdn/${version}/img/${imageDirectories[kind]}/${filename}`;
}

/** Rune icons are unversioned paths supplied by runesReforged.json. */
export function dataDragonRuneIconUrl(icon: string): string {
	if (icon.length > 256 || !/^perk-images\/(?:[A-Za-z0-9_-]+\/)+[A-Za-z0-9_-]+\.png$/.test(icon)) {
		throw new RiotError('INVALID_ARGUMENT', '룬 아이콘 경로가 올바르지 않습니다.');
	}
	return `${DATA_DRAGON_ORIGIN}/cdn/img/${icon}`;
}

/** 챔피언 스플래시 아트는 버전 없는 경로를 쓴다. championId는 카탈로그의 id(예: MissFortune)다. */
export function dataDragonSplashUrl(championId: string, skin = 0): string {
	if (!/^[A-Za-z0-9]{1,64}$/.test(championId) || !Number.isInteger(skin) || skin < 0) {
		throw new RiotError('INVALID_ARGUMENT', '챔피언 ID 또는 스킨 번호가 올바르지 않습니다.');
	}
	return `${DATA_DRAGON_ORIGIN}/cdn/img/champion/splash/${championId}_${skin}.jpg`;
}
