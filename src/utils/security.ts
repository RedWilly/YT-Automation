import { lookup } from "node:dns/promises";
import { isIPv4, isIPv6 } from "node:net";

/**
 * Checks if an IP address is private or reserved.
 */
export function isPrivateIP(ip: string): boolean {
    if (isIPv4(ip)) {
        const parts = ip.split('.').map(Number);
        const [a, b, c, d] = parts as [number, number, number, number];

        return (
            a === 0 || // 0.0.0.0/8
            a === 10 || // 10.0.0.0/8
            a === 127 || // 127.0.0.0/8 (Loopback)
            (a === 169 && b === 254) || // 169.254.0.0/16 (Link-local)
            (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
            (a === 192 && b === 168) || // 192.168.0.0/16
            (a >= 224) // Multicast and Reserved (224.0.0.0/4 and 240.0.0.0/4)
        );
    }

    if (isIPv6(ip)) {
        // Normalize IPv6 is complex without a library, but we can check common prefixes
        const normalized = ip.toLowerCase();

        // Loopback
        if (normalized === '::1' || normalized.match(/^0{0,3}::0{0,3}1$/)) return true;

        // Unique Local Addresses (fc00::/7) -> starts with fc or fd
        if (/^f[cd]/i.test(normalized)) return true;

        // Link-Local Unicast (fe80::/10) -> starts with fe8, fe9, fea, feb
        if (/^fe[89ab]/i.test(normalized)) return true;

        // IPv4-mapped IPv6 (::ffff:0:0/96)
        if (normalized.includes('::ffff:')) {
            const parts = normalized.split(':');
            const lastPart = parts[parts.length - 1];
            // If the last part looks like an IPv4 address, validate it
            if (lastPart && isIPv4(lastPart)) {
                return isPrivateIP(lastPart);
            }
        }
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
        // We use all: true to get all resolved addresses
        // @ts-ignore - Bun types for lookup options
        const result = await lookup(parsedUrl.hostname, { all: true });

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
        // We fail safe.
        throw new Error(`DNS resolution failed for ${parsedUrl.hostname}`);
    }
}
