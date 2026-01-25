import { describe, expect, it } from "bun:test";
import { isPrivateIP, validateUrl } from "../security.ts";

describe("Security Utils", () => {
    describe("isPrivateIP", () => {
        it("should identify private IPv4 addresses", () => {
            expect(isPrivateIP("127.0.0.1")).toBe(true);
            expect(isPrivateIP("10.0.0.1")).toBe(true);
            expect(isPrivateIP("172.16.0.1")).toBe(true);
            expect(isPrivateIP("192.168.1.1")).toBe(true);
            expect(isPrivateIP("169.254.1.1")).toBe(true);
            expect(isPrivateIP("0.0.0.0")).toBe(true);
        });

        it("should identify public IPv4 addresses", () => {
            expect(isPrivateIP("8.8.8.8")).toBe(false);
            expect(isPrivateIP("1.1.1.1")).toBe(false);
            expect(isPrivateIP("172.32.0.1")).toBe(false); // Outside 172.16-31 range
        });

        it("should identify private IPv6 addresses", () => {
            expect(isPrivateIP("::1")).toBe(true);
            expect(isPrivateIP("fc00::1")).toBe(true);
            expect(isPrivateIP("fe80::1")).toBe(true);
        });

        it("should identify IPv4-mapped IPv6 addresses", () => {
            expect(isPrivateIP("::ffff:127.0.0.1")).toBe(true);
            expect(isPrivateIP("::ffff:192.168.1.1")).toBe(true);
            expect(isPrivateIP("::ffff:8.8.8.8")).toBe(false);
        });
    });

    describe("validateUrl", () => {
        it("should reject non-http/https protocols", async () => {
            try {
                await validateUrl("ftp://example.com");
                expect(true).toBe(false); // Should not reach here
            } catch (e: any) {
                expect(e.message).toContain("Forbidden protocol");
            }
        });

        it("should reject localhost", async () => {
            try {
                await validateUrl("http://localhost");
                expect(true).toBe(false);
            } catch (e: any) {
                expect(e.message).toContain("private IP");
            }
        });

        it("should reject 127.0.0.1", async () => {
            try {
                await validateUrl("http://127.0.0.1");
                expect(true).toBe(false);
            } catch (e: any) {
                expect(e.message).toContain("private IP");
            }
        });

        // We can't easily test public DNS resolution without internet and a specific domain.
        // But we verified the IP check logic.
    });
});
