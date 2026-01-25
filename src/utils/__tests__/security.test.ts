import { describe, expect, test } from "bun:test";
import { isPrivateIP, validateUrl } from "../security.ts";

describe("Security Utils", () => {
    describe("isPrivateIP", () => {
        test("should identify private IPv4 addresses", () => {
            expect(isPrivateIP("127.0.0.1")).toBe(true);
            expect(isPrivateIP("10.0.0.1")).toBe(true);
            expect(isPrivateIP("192.168.1.1")).toBe(true);
            expect(isPrivateIP("172.16.0.1")).toBe(true);
            expect(isPrivateIP("172.31.255.255")).toBe(true);
            expect(isPrivateIP("169.254.1.1")).toBe(true);
            expect(isPrivateIP("0.0.0.0")).toBe(true);
        });

        test("should identify public IPv4 addresses", () => {
            expect(isPrivateIP("8.8.8.8")).toBe(false);
            expect(isPrivateIP("1.1.1.1")).toBe(false);
            expect(isPrivateIP("172.32.0.1")).toBe(false); // Outside private range
            expect(isPrivateIP("11.0.0.1")).toBe(false);
        });

        test("should identify private IPv6 addresses", () => {
            expect(isPrivateIP("::1")).toBe(true);
            expect(isPrivateIP("fc00::1")).toBe(true);
            expect(isPrivateIP("fd00::1")).toBe(true);
            expect(isPrivateIP("fe80::1")).toBe(true);
        });

        test("should identify IPv4-mapped IPv6 private addresses", () => {
            expect(isPrivateIP("::ffff:127.0.0.1")).toBe(true);
            expect(isPrivateIP("::ffff:192.168.1.1")).toBe(true);
        });

        test("should identify public IPv4-mapped IPv6 addresses", () => {
             expect(isPrivateIP("::ffff:8.8.8.8")).toBe(false);
        });
    });

    describe("validateUrl", () => {
        test("should validate safe HTTP/HTTPS URLs", async () => {
            // Google.com is expected to be public
            await expect(validateUrl("https://google.com")).resolves.toBeUndefined();
        });

        test("should reject non-HTTP/HTTPS protocols", async () => {
            await expect(validateUrl("file:///etc/passwd")).rejects.toThrow("Forbidden protocol");
            await expect(validateUrl("ftp://example.com")).rejects.toThrow("Forbidden protocol");
        });

        test("should reject private IPs (SSRF)", async () => {
            await expect(validateUrl("http://127.0.0.1")).rejects.toThrow("Access denied to private IP");
            await expect(validateUrl("http://localhost")).rejects.toThrow("Access denied to private IP");
            // Assuming 192.168.1.1 is not reachable but still private, lookup might just return it
            await expect(validateUrl("http://192.168.1.1")).rejects.toThrow("Access denied to private IP");
        });
    });
});
