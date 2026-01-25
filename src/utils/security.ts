import { lookup } from "node:dns/promises";

/**
 * Checks if an IP address is private or reserved.
 */
export function isPrivateIP(ip: string): boolean {
    // IPv4
    if (ip === '0.0.0.0') return true;

    // Check if IPv4
    const ipv4Parts = ip.split('.').map(Number);
    if (ipv4Parts.length === 4 && ipv4Parts.every(p => !isNaN(p) && p >= 0 && p <= 255)) {
        const [a, b] = ipv4Parts as [number, number, number, number];

        // 127.0.0.0/8 (Loopback)
        if (a === 127) return true;

        // 10.0.0.0/8 (Private)
        if (a === 10) return true;

        // 192.168.0.0/16 (Private)
        if (a === 192 && b === 168) return true;

        // 172.16.0.0/12 (Private)
        if (a === 172 && b >= 16 && b <= 31) return true;

        // 169.254.0.0/16 (Link-local)
        if (a === 169 && b === 254) return true;

        return false;
    }

    // IPv6 checks (basic)
    // ::1 (Loopback)
    if (ip === '::1') return true;

    // fc00::/7 (Unique Local Addresses) - fc or fd
    if (/^f[cd][0-9a-f]{2}:/i.test(ip)) return true;

    // fe80::/10 (Link-Local Unicast)
    if (/^fe[89ab][0-9a-f]:/i.test(ip)) return true;

    // ::ffff:127.0.0.1 (IPv4-mapped IPv6)
    if (ip.toLowerCase().startsWith('::ffff:')) {
        const ipv4Part = ip.substring(7);
        return isPrivateIP(ipv4Part);
    }

    return false;
}

/**
 * Validates a URL for security risks (SSRF, LFI).
 * Throws an error if the URL is invalid or points to a private network.
 */
export async function validateUrl(url: string): Promise<void> {
    let parsedUrl: URL;
    try {
        parsedUrl = new URL(url);
    } catch {
        throw new Error("Invalid URL format");
    }

    // 1. Protocol Validation
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error(`Forbidden protocol: ${parsedUrl.protocol}`);
    }

    // 2. DNS Resolution & IP Validation
    try {
        // We use all: true to get all resolved addresses to prevent DNS pinning bypass/rebinding to some extent
        // although true DNS rebinding protection requires pinning the socket.
        // @ts-ignore - Bun types might not fully match Node's lookup options perfectly in all versions, but this is standard.
        const result = await lookup(parsedUrl.hostname, { all: true });

        // If result is an array (when all: true)
        const addresses = Array.isArray(result) ? result : [result];

        for (const entry of addresses) {
            if (isPrivateIP(entry.address)) {
                throw new Error(`Access denied to private IP: ${entry.address}`);
            }
        }
    } catch (error) {
        if (error instanceof Error && error.message.includes("Access denied")) {
            throw error;
        }
        // If DNS lookup fails, it implies the host is unreachable or invalid
        throw new Error(`DNS resolution failed for ${parsedUrl.hostname}`);
    }
}
