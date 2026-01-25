import { validateUrl } from "./security.ts";
import * as logger from "./logger.ts";

/**
 * Performs a fetch request with SSRF protection.
 * Validates the URL and follows redirects safely (checking each hop).
 * Strips sensitive headers on cross-origin redirects.
 */
export async function safeFetch(url: string, options: RequestInit = {}): Promise<Response> {
    const MAX_REDIRECTS = 5;
    let currentUrl = url;
    let redirectCount = 0;
    const currentOptions = { ...options }; // Clone options to modify

    while (redirectCount <= MAX_REDIRECTS) {
        // Validate the current URL (DNS resolution + IP check)
        await validateUrl(currentUrl);

        // Fetch with manual redirect handling
        const response = await fetch(currentUrl, {
            ...currentOptions,
            redirect: "manual",
        });

        // Check if it's a redirect
        if (response.status >= 301 && response.status <= 308) {
            const location = response.headers.get("location");
            if (location) {
                redirectCount++;
                if (redirectCount > MAX_REDIRECTS) {
                    throw new Error(`Too many redirects (max ${MAX_REDIRECTS})`);
                }

                // Resolve relative URLs
                let newUrl: URL;
                try {
                    newUrl = new URL(location, currentUrl);
                } catch {
                    throw new Error(`Invalid redirect URL: ${location}`);
                }

                // Check for cross-origin redirect and strip headers
                const oldUrl = new URL(currentUrl);
                if (newUrl.origin !== oldUrl.origin) {
                    // Normalize headers to Headers object to easily delete
                    const headers = new Headers(currentOptions.headers);
                    headers.delete("authorization");
                    headers.delete("www-authenticate");
                    headers.delete("cookie");
                    headers.delete("proxy-authorization");

                    // Update headers in options
                    currentOptions.headers = headers;
                }

                currentUrl = newUrl.toString();

                logger.debug("Security", `Following redirect to ${currentUrl}`);
                continue;
            }
        }

        return response;
    }

    throw new Error(`Too many redirects (max ${MAX_REDIRECTS})`);
}
