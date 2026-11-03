import { dev } from '$app/env';
import { DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_REDIRECT_URI } from '$app/env/private';
import { readOAuthConfig } from './oauth.ts';

export function getOAuthConfig() {
	return readOAuthConfig({ DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_REDIRECT_URI }, dev);
}
