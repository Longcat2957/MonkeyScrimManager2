export function isLoopback(hostname: string) {
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}
