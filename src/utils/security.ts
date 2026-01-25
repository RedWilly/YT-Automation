import { lookup } from "node:dns/promises";

/**
 * Checks if an IP address is private or reserved.
 * Supports IPv4 and IPv6.
 */
export function isPrivateIP(ip: string): boolean {
    // IPv4
    if (ip.includes(".")) {
        // Handle IPv4-mapped IPv6 addresses (e.g., ::ffff:127.0.0.1)
        if (ip.startsWith("::ffff:")) {
            ip = ip.substring(7);
        }

        const parts = ip.split(".").map(Number);
        if (parts.length !== 4 || parts.some(isNaN)) return false;

        // 0.0.0.0/8 (Current network)
        if (parts[0] === 0) return true;
        // 127.0.0.0/8 (Loopback)
        if (parts[0] === 127) return true;
        // 10.0.0.0/8 (Private)
        if (parts[0] === 10) return true;
        // 172.16.0.0/12 (Private)
        if (parts[0] === 172 && parts[1]! >= 16 && parts[1]! <= 31) return true;
        // 192.168.0.0/16 (Private)
        if (parts[0] === 192 && parts[1] === 168) return true;
        // 169.254.0.0/16 (Link-local)
        if (parts[0] === 169 && parts[1] === 254) return true;

        return false;
    }

    // IPv6
    // ::1 (Loopback)
    if (ip === "::1") return true;
    // fc00::/7 (Unique Local) - starts with fc or fd
    if (ip.toLowerCase().startsWith("fc") || ip.toLowerCase().startsWith("fd")) return true;
    // fe80::/10 (Link-local) - starts with fe8, fe9, fea, feb
    if (/^fe[89ab]/i.test(ip)) return true;

    return false;
}

/**
 * Validates a URL to ensure it doesn't point to a private IP.
 * Performs DNS resolution.
 */
export async function validateUrl(url: string): Promise<void> {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        throw new Error("Invalid URL format");
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error(`Forbidden protocol: ${parsed.protocol}`);
    }

    const hostname = parsed.hostname;

    // Check if hostname is an IP literal
    // IPv6 literals are enclosed in brackets in URL.hostname, but usually `new URL` handles it.
    // If it's an IP literal, validate directly.
    // We can just try to resolve it. lookup() handles IP literals too.

    try {
        const { address } = await lookup(hostname);
        if (isPrivateIP(address)) {
            throw new Error(`URL resolves to private IP: ${address}`);
        }
    } catch (error) {
        if (error instanceof Error && error.message.includes("URL resolves to private IP")) {
            throw error;
        }
        // If DNS lookup fails, we should probably fail safe.
        throw new Error(`DNS resolution failed for ${hostname}`);
    }
}
