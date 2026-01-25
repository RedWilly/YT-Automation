import { describe, expect, it, mock, afterEach } from "bun:test";
import { safeFetch } from "../network.ts";

// No module mocking to avoid polluting other tests.
// We use public IPs for testing to pass validateUrl check.
// Since we mock global.fetch, no actual network request is made.

describe("safeFetch", () => {
    const originalFetch = global.fetch;

    afterEach(() => {
        global.fetch = originalFetch;
    });

    it("should follow redirects", async () => {
        const mockFetch = mock((url) => {
            if (url === "http://1.1.1.1/") {
                return Promise.resolve(new Response(null, { status: 302, headers: { Location: "http://1.0.0.1/" } }));
            }
            if (url === "http://1.0.0.1/") {
                return Promise.resolve(new Response("ok"));
            }
            return Promise.reject(new Error(`Unknown url: ${url}`));
        });
        global.fetch = mockFetch as any;

        const res = await safeFetch("http://1.1.1.1/");
        expect(await res.text()).toBe("ok");
        expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should strip sensitive headers on cross-origin redirect", async () => {
        let capturedHeadersB: Headers | undefined;

        const mockFetch = mock((url, options: any) => {
            if (url === "http://1.1.1.1/") {
                // Redirect to different IP (different origin)
                return Promise.resolve(new Response(null, { status: 302, headers: { Location: "http://1.0.0.1/" } }));
            }
            if (url === "http://1.0.0.1/") {
                capturedHeadersB = new Headers(options?.headers);
                return Promise.resolve(new Response("ok"));
            }
            return Promise.reject(new Error(`Unknown url: ${url}`));
        });
        global.fetch = mockFetch as any;

        await safeFetch("http://1.1.1.1/", {
            headers: {
                "Authorization": "secret",
                "X-Custom": "public"
            }
        });

        expect(capturedHeadersB).toBeDefined();
        expect(capturedHeadersB?.has("authorization")).toBe(false);
        expect(capturedHeadersB?.get("x-custom")).toBe("public");
    });

    it("should preserve headers on same-origin redirect", async () => {
        let capturedHeadersB: Headers | undefined;

        const mockFetch = mock((url, options: any) => {
            if (url === "http://1.1.1.1/1") {
                // Redirect to same origin (same IP/port)
                return Promise.resolve(new Response(null, { status: 302, headers: { Location: "http://1.1.1.1/2" } }));
            }
            if (url === "http://1.1.1.1/2") {
                capturedHeadersB = new Headers(options?.headers);
                return Promise.resolve(new Response("ok"));
            }
            return Promise.reject(new Error(`Unknown url: ${url}`));
        });
        global.fetch = mockFetch as any;

        await safeFetch("http://1.1.1.1/1", {
            headers: {
                "Authorization": "secret"
            }
        });

        expect(capturedHeadersB).toBeDefined();
        expect(capturedHeadersB?.get("authorization")).toBe("secret");
    });

    it("should fail on too many redirects", async () => {
        const mockFetch = mock(() => {
            // Redirect to itself
            return Promise.resolve(new Response(null, { status: 302, headers: { Location: "http://1.1.1.1/" } }));
        });
        global.fetch = mockFetch as any;

        try {
            await safeFetch("http://1.1.1.1/");
            expect(true).toBe(false); // Should not reach here
        } catch (e: any) {
            expect(e.message).toContain("Too many redirects");
        }
    });
});
