import { dev } from '$app/env';
import type { Reroute } from '@sveltejs/kit/hooks';
import { isLoopback } from '#lib/ui/local-preview.ts';

export const reroute: Reroute = ({ url }) => {
    if (
        dev &&
        isLoopback(url.hostname) &&
        url.pathname === '/' &&
        url.searchParams.get('app') !== '1' &&
        url.searchParams.get('mock') !== '1'
    )
        return '/dev/landing';
};
