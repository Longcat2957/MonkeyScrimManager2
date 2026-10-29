import { dev } from '$app/env';
import { getGuildHome } from '#lib/data/index.ts';
import { currentScenario } from '#lib/mocks/simulate.ts';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params, url }) => {
	const scenario = currentScenario(url, dev);
	return { home: await getGuildHome(params.guildId, scenario) };
};
