import { dev } from '$app/env';
import { getGuildStats } from '#lib/data/index.ts';
import { currentScenario } from '#lib/mocks/simulate.ts';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params, url }) => {
	const scenario = currentScenario(url, dev);
	return { stats: await getGuildStats(params.guildId, scenario) };
};
